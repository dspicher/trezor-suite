import { EventEmitter } from 'events';
import { SocketBase } from './sockets/base';
import { ElectrumAPI, BlockHeader, Version } from './api';
import { makeRequest, createPromiseResult, MessageParser } from './util';

const KEEP_ALIVE_INTERVAL = 120 * 1000; // 2 minutes

const PERSISTENCE_POLICY = {
    maxRetry: 10,
    callback: null,
};

type CallbackMessageQueue = Record<number, ReturnType<typeof createPromiseResult>>;

type ElectrumClientOptions = {
    client: {
        name: string;
        protocolVersion: string | [string, string];
    };
    url: string;
    debug?: boolean;
    persistencePolicy?: {
        maxRetry: number;
        callback: unknown;
    };
};

export class ElectrumClient implements ElectrumAPI {
    private id = 0;
    private timeLastCall = 0;
    private callbackMessageQueue: CallbackMessageQueue = {};
    private emitter = new EventEmitter();
    private parser = new MessageParser((body, n) => {
        this.onMessage(body, n);
    });
    private socket?: SocketBase;
    private keepAliveHandle?: ReturnType<typeof setInterval>;

    private options?: ElectrumClientOptions;
    private banner?: string;
    private version?: Version;
    private lastBlock?: BlockHeader;

    async connect(socket: SocketBase, options: ElectrumClientOptions) {
        if (this.socket) return;

        this.timeLastCall = 0;
        this.options = options;

        const { name, protocolVersion } = options.client;

        try {
            this.socket = socket;
            await this.socket.connect(this);

            this.banner = await (this as ElectrumAPI).request('server.banner');
            this.version = await (this as ElectrumAPI).request(
                'server.version',
                name,
                protocolVersion
            );
            (this as ElectrumAPI).on('blockchain.headers.subscribe', this.onBlock);
            this.lastBlock = await (this as ElectrumAPI).request('blockchain.headers.subscribe');
        } catch (err) {
            this.socket = undefined;
            throw new Error(`failed to connect to electrum server: [${err}]`);
        }

        this.keepAlive();

        return this.version;
    }

    connected() {
        return !!this.socket;
    }

    getInfo() {
        if (this.options?.url && this.version && this.lastBlock) {
            return {
                url: this.options?.url,
                version: this.version,
                block: this.lastBlock,
            };
        }
    }

    private onBlock(block: BlockHeader) {
        this.lastBlock = block;
    }

    on(event: string, listener: (...args: any[]) => void) {
        this.emitter.addListener(event, listener);
    }

    off(event: string, listener: (...args: any[]) => void) {
        this.emitter.removeListener(event, listener);
    }

    close() {
        this.socket?.close();
        this.socket = undefined;
    }

    request(method: string, ...params: any[]) {
        const { socket } = this;
        if (!socket) {
            throw new Error('Connection not established');
        }
        this.timeLastCall = new Date().getTime();
        return new Promise<any>((resolve, reject) => {
            const id = ++this.id;
            const content = makeRequest(method, params, id);
            if (this.options?.debug) console.log('SENT:', content);
            this.callbackMessageQueue[id] = createPromiseResult(resolve, reject);
            socket.send(`${content}\n`);
        });
    }

    private response(msg) {
        const callback = this.callbackMessageQueue[msg.id];

        if (callback) {
            delete this.callbackMessageQueue[msg.id];
            if (msg.error) {
                callback(msg.error.message);
            } else {
                callback(null, msg.result);
            }
        } else {
            console.log("Can't get callback");
        }
    }

    /**
     * Ping the server to ensure it is responding, and to keep the session alive.
     * The server may disconnect clients that have sent no requests for roughly 10
     * minutes. It sends a ping request every 2 minutes. If the request fails it
     * logs an error and closes the connection.
     */
    keepAlive() {
        if (!this.socket) return;
        this.keepAliveHandle = setInterval(
            async client => {
                if (
                    this.timeLastCall !== 0 &&
                    new Date().getTime() > this.timeLastCall + KEEP_ALIVE_INTERVAL / 2
                ) {
                    await (this as ElectrumAPI).request('server.ping').catch(err => {
                        console.error(`ping to server failed: [${err}]`);
                        client.close(); // TODO: we should reconnect
                    });
                }
            },
            KEEP_ALIVE_INTERVAL,
            this // pass this context as an argument to function
        );
    }

    onMessage(body, n) {
        const msg = JSON.parse(body);
        if (this.options?.debug) console.log('RECEIVED:', msg);
        if (msg instanceof Array) {
            // don't support batch request
        } else if (msg.id) {
            this.response(msg);
        } else {
            this.emitter.emit(msg.method, msg.params);
        }
    }

    onConnect() {
        console.log('CONNECTED');
    }

    onRecv(chunk: unknown) {
        // console.log(`onRecv: [${chunk}]`);
        this.parser.run(chunk);
    }

    onEnd(e: unknown) {
        console.log(`onEnd: [${e}]`);
    }

    onError(error: unknown) {
        console.log(`onError: [${error}]`);
    }

    onClose() {
        this.socket = undefined;
        Object.keys(this.callbackMessageQueue).forEach(key => {
            this.callbackMessageQueue[key](new Error('close connect'));
            delete this.callbackMessageQueue[key];
        });

        // TODO: We should probably leave listeners if the have persistency policy.
        this.emitter.removeAllListeners();

        // Stop keep alive.
        if (this.keepAliveHandle) clearInterval(this.keepAliveHandle);

        // TODO: Refactor persistency
        // if (this.persistencePolicy) {
        //   if (this.persistencePolicy.maxRetry > 0) {
        //     this.reconnect();
        //     this.persistencePolicy.maxRetry -= 1;
        //   } else if (this.persistencePolicy.callback != null) {
        //     this.persistencePolicy.callback();
        //   }
        // }
    }

    // TODO: Refactor persistency
    // reconnect() {
    //   return this.initElectrum(this.electrumConfig);
    // }
}
