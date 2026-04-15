use crate::protocol::{ClientMsg, ServerMsg, AUTH_TOKEN, WS_PORT};
use crate::state::Store;
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Query, State,
    },
    response::IntoResponse,
    routing::get,
    Router,
};
use futures_util::{sink::SinkExt, stream::StreamExt};
use serde::Deserialize;
use std::net::SocketAddr;

#[derive(Deserialize)]
struct AuthQuery {
    token: Option<String>,
}

pub async fn run(store: Store) {
    let app = Router::new()
        .route("/ws", get(ws_handler))
        .with_state(store);

    let addr: SocketAddr = format!("127.0.0.1:{}", WS_PORT).parse().unwrap();
    eprintln!("[biovault] WS server listening on ws://{addr}/ws");
    let listener = tokio::net::TcpListener::bind(addr).await.expect("bind ws");
    axum::serve(listener, app).await.expect("ws serve");
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    Query(q): Query<AuthQuery>,
    State(store): State<Store>,
) -> impl IntoResponse {
    if q.token.as_deref() != Some(AUTH_TOKEN) {
        return axum::http::StatusCode::UNAUTHORIZED.into_response();
    }
    ws.on_upgrade(move |socket| handle_socket(socket, store))
}

async fn handle_socket(socket: WebSocket, store: Store) {
    let (mut sender, mut receiver) = socket.split();
    let mut rx = store.subscribe();

    let initial = ServerMsg::State {
        state: store.snapshot().await,
    };
    if sender
        .send(Message::Text(serde_json::to_string(&initial).unwrap()))
        .await
        .is_err()
    {
        return;
    }

    let mut send_task = tokio::spawn(async move {
        while let Ok(msg) = rx.recv().await {
            let text = match serde_json::to_string(&msg) {
                Ok(t) => t,
                Err(_) => continue,
            };
            if sender.send(Message::Text(text)).await.is_err() {
                break;
            }
        }
    });

    let store_for_recv = store.clone();
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            let Message::Text(text) = msg else { continue };
            let parsed: Result<ClientMsg, _> = serde_json::from_str(&text);
            match parsed {
                Ok(ClientMsg::Command { command }) => {
                    if let Err(err) = store_for_recv.apply(command).await {
                        eprintln!("[biovault] command error: {err}");
                    }
                }
                Err(e) => {
                    eprintln!("[biovault] bad client msg: {e}");
                }
            }
        }
    });

    tokio::select! {
        _ = (&mut send_task) => recv_task.abort(),
        _ = (&mut recv_task) => send_task.abort(),
    }
}
