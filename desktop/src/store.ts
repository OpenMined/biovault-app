import { createStore, WsTransport } from '@biovault/protocol'

export const { useAppState, send } = createStore(new WsTransport())
