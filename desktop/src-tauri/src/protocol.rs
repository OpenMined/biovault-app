use serde::{Deserialize, Serialize};

pub const AUTH_TOKEN: &str = "biovault-dev-token";
pub const WS_PORT: u16 = 17890;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Screen {
    Warning,
    Home,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AppState {
    pub screen: Screen,
    pub agreed: bool,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            screen: Screen::Warning,
            agreed: false,
        }
    }
}

#[derive(Deserialize, Debug)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Command {
    SetAgreed { agreed: bool },
    Continue,
    Reset,
}

#[derive(Deserialize, Debug)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClientMsg {
    Command { command: Command },
}

#[derive(Serialize, Debug, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerMsg {
    State { state: AppState },
}
