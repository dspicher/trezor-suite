import { CustomError } from '../../constants/errors';
import { MESSAGES, RESPONSES } from '../../constants';
import type { Message, Response } from '../../types';
import * as M from './methods';
import * as L from './listeners';
import WorkerCommon from '../common';
import { createSocket } from './sockets';
import { ElectrumClient } from './client';

declare function postMessage(data: Response): void;

const common = new WorkerCommon(postMessage);
const electrumClient = new ElectrumClient();
const blockListener = L.blockListener(electrumClient, common);
const txListener = L.txListener(electrumClient, common);

const connect = async () => {
    if (!electrumClient.connected()) {
        const { server, debug, timeout, keepAlive } = common.getSettings();
        const { url, socket } = createSocket(server, { timeout, keepAlive });
        await electrumClient.connect(socket, {
            url,
            debug,
            client: {
                name: 'blockchain-link',
                protocolVersion: '1.4',
            },
        });
    }
    return electrumClient;
};

const disconnect = (data: any) => {};

const cleanup = () => {};

const call = <M extends Message & { payload: any }, R extends Response>(
    method: (
        client: ElectrumClient,
        payload: M['payload'],
        common: WorkerCommon
    ) => Promise<R['payload']>,
    data: M,
    type: R['type']
) =>
    connect()
        .then(client => method(client, data.payload, common))
        .then(res => common.response({ id: data.id, type, payload: res }))
        .catch(error => common.errorHandler({ id: data.id, error }));

// WebWorker message handling
export const onmessage = (event: { data: Message }) => {
    if (!event.data) return;
    const { data } = event;
    const { id, type } = data;

    common.debug('onmessage', data);
    switch (data.type) {
        case MESSAGES.HANDSHAKE:
            common.setSettings(data.settings);
            break;
        case MESSAGES.CONNECT:
            connect()
                .then(() => common.response({ id, type: RESPONSES.CONNECT, payload: true }))
                .catch(error => common.errorHandler({ id, error }));
            break;
        case MESSAGES.DISCONNECT:
            disconnect(data);
            break;
        case MESSAGES.GET_INFO:
            connect()
                .then(client => M.getInfo(client, common))
                .then(res =>
                    common.response({ id: data.id, type: RESPONSES.GET_INFO, payload: res })
                )
                .catch(error => common.errorHandler({ id: data.id, error }));
            break;
        case MESSAGES.GET_BLOCK_HASH:
            call(M.getBlockHash, data, RESPONSES.GET_BLOCK_HASH);
            break;
        case MESSAGES.GET_ACCOUNT_INFO:
            call(M.getAccountInfo, data, RESPONSES.GET_ACCOUNT_INFO);
            break;
        case MESSAGES.GET_ACCOUNT_UTXO:
            call(M.getAccountUtxo, data, RESPONSES.GET_ACCOUNT_UTXO);
            break;
        case MESSAGES.GET_TRANSACTION:
            call(M.getTransaction, data, RESPONSES.GET_TRANSACTION);
            break;
        case MESSAGES.GET_ACCOUNT_BALANCE_HISTORY:
            call(M.getAccountBalanceHistory, data, RESPONSES.GET_ACCOUNT_BALANCE_HISTORY);
            break;
        case MESSAGES.ESTIMATE_FEE:
            call(M.estimateFee, data, RESPONSES.ESTIMATE_FEE);
            break;
        case MESSAGES.SUBSCRIBE:
            connect()
                .then(() => {
                    switch (data.payload.type) {
                        case 'block':
                            return blockListener.subscribe();
                        case 'addresses':
                        case 'accounts':
                            return txListener.subscribe(data.payload);
                        default:
                            throw new CustomError(
                                `Subscription ${data.payload.type} not implemented`
                            );
                    }
                })
                .then(res =>
                    common.response({ id: data.id, type: RESPONSES.SUBSCRIBE, payload: res })
                )
                .catch(error => common.errorHandler({ id: data.id, error }));
            break;
        case MESSAGES.UNSUBSCRIBE:
            connect()
                .then(() => {
                    switch (data.payload.type) {
                        case 'block':
                            return blockListener.unsubscribe();
                        case 'addresses':
                        case 'accounts':
                            return txListener.unsubscribe(data.payload);
                        default:
                            throw new CustomError(
                                `Subscription ${data.payload.type} not implemented`
                            );
                    }
                })
                .then(res =>
                    common.response({ id: data.id, type: RESPONSES.UNSUBSCRIBE, payload: res })
                )
                .catch(error => common.errorHandler({ id: data.id, error }));
            break;
        case MESSAGES.PUSH_TRANSACTION:
            throw new CustomError(`Method not implemented: ${data.type}`);
        // @ts-ignore this message is used in tests
        case 'terminate':
            cleanup();
            break;
        // @ts-ignore this message is used in tests
        case 'raw':
            connect()
                // @ts-ignore
                .then(client => client.request(data.payload.method, data.payload.params))
                .then(res =>
                    // @ts-ignore
                    common.response({ id, type: data.payload.method, payload: res })
                );
            break;
        default:
            common.errorHandler({
                id,
                error: new CustomError('worker_unknown_request', `+${type}`),
            });
            break;
    }
};

// Handshake to host
common.handshake();
