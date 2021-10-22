import type { Socket as TCPSocket } from 'net';
import type { TLSSocket } from 'tls';

const TIMEOUT = 10000;
const KEEP_ALIVE = true;

type Socket = TCPSocket | TLSSocket;

type Err = Error &
    Partial<{
        errorno: string;
        code: string;
        connect: boolean;
    }>;

export type SocketListener = {
    onConnect: () => void;
    onClose: (e: unknown) => void;
    onRecv: (e: unknown) => void;
    onEnd: (e: unknown) => void;
    onError: (e: unknown) => void;
};

export type SocketConfig = {
    host: string;
    port: number;
    timeout?: number;
    keepAlive?: boolean;
};

export abstract class SocketBase {
    private socket?: Socket;
    protected host: string;
    protected port: number;
    protected timeout: number;
    protected keepAlive: boolean;

    constructor({ host, port, timeout, keepAlive }: SocketConfig) {
        this.host = host;
        this.port = port;
        this.timeout = timeout !== undefined ? timeout : TIMEOUT;
        this.keepAlive = keepAlive !== undefined ? keepAlive : KEEP_ALIVE;
    }

    async connect(listener: SocketListener) {
        this.socket = await this.openSocket(listener);
    }

    close() {
        this.socket?.end();
        this.socket?.destroy();
    }

    send(data: string | Uint8Array) {
        return this.socket?.write(data);
    }

    protected abstract openSocket(listener: SocketListener): Promise<Socket>;

    protected configureSocket(socket: Socket) {
        socket.setTimeout(this.timeout);
        socket.setEncoding('utf8');
        socket.setKeepAlive(this.keepAlive);
        socket.setNoDelay(true);
    }

    protected bindSocket(socket: Socket, listener: SocketListener) {
        socket.on('connect', () => {
            socket.setTimeout(0);
            listener.onConnect();
        });

        socket.on('close', e => {
            listener.onClose(e);
        });

        socket.on('timeout', () => {
            const e: Err = new Error('ETIMEDOUT');
            e.errorno = 'ETIMEDOUT';
            e.code = 'ETIMEDOUT';
            e.connect = false;
            socket.emit('error', e);
        });

        socket.on('data', chunk => {
            socket.setTimeout(0);
            listener.onRecv(chunk);
        });

        socket.on('end', e => {
            socket.setTimeout(0);
            listener.onEnd(e);
        });

        socket.on('error', e => {
            listener.onError(e);
        });
    }
}
