use crate::protocol::{AppState, Command, Screen, ServerMsg};
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};

#[derive(Clone)]
pub struct Store {
    inner: Arc<RwLock<AppState>>,
    tx: broadcast::Sender<ServerMsg>,
}

impl Store {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(64);
        Self {
            inner: Arc::new(RwLock::new(AppState::default())),
            tx,
        }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<ServerMsg> {
        self.tx.subscribe()
    }

    pub async fn snapshot(&self) -> AppState {
        self.inner.read().await.clone()
    }

    pub async fn apply(&self, cmd: Command) -> Result<AppState, String> {
        let mut s = self.inner.write().await;
        match cmd {
            Command::SetAgreed { agreed } => s.agreed = agreed,
            Command::Continue => {
                if !s.agreed {
                    return Err("must accept terms before continuing".into());
                }
                s.screen = Screen::Home;
            }
            Command::Reset => *s = AppState::default(),
        }
        let snap = s.clone();
        drop(s);
        let _ = self.tx.send(ServerMsg::State {
            state: snap.clone(),
        });
        Ok(snap)
    }
}
