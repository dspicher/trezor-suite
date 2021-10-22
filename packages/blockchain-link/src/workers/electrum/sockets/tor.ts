import { SocksClient } from 'socks';
import { SocketBase, SocketListener, SocketConfig } from './base';

type TorSocketConfig = SocketConfig & {
    tor: {
        host: string;
        port: number;
    };
};

export class TorSocket extends SocketBase {
    private torHost: string;
    private torPort: number;

    constructor({ tor, ...rest }: TorSocketConfig) {
        super(rest);
        this.torHost = tor.host;
        this.torPort = tor.port;
    }

    protected async openSocket(listener: SocketListener) {
        const { host, port, torHost, torPort } = this;
        const { socket } = await SocksClient.createConnection({
            set_tcp_nodelay: true,
            timeout: this.timeout,
            command: 'connect',
            destination: { host, port },
            proxy: { port: torPort, type: 5, ipaddress: torHost },
        });
        this.configureSocket(socket);
        this.bindSocket(socket, listener);
        return socket;
    }
}
