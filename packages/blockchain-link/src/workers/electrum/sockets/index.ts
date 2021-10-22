import { CustomError } from '../../../constants/errors';
import { TcpSocket } from './tcp';
import { TlsSocket } from './tls';
import { TorSocket } from './tor';
import { SocketBase } from './base';

const TOR = {
    host: '127.0.0.1',
    port: 9050,
};

type SocketOptions = {
    timeout?: number;
    keepAlive?: boolean;
    tor?: {
        host: string;
        port: number;
    };
};

export const createSocket = (
    server: string[],
    options?: SocketOptions
): { url: string; socket: SocketBase } => {
    if (!server || !Array.isArray(server) || server.length < 1) {
        throw new CustomError('connect', 'Endpoint not set');
    }
    const url = server[0];
    const [protocol, host, portString] = url.replace('//', '').split(':');
    if (!host) throw new CustomError('Missing host');
    const port = Number.parseInt(portString, 10);
    if (!port) throw new CustomError('Invalid port');
    const { timeout, keepAlive, tor } = options || {};
    switch (protocol) {
        case 'tcp':
            return {
                url,
                socket: new TcpSocket({ host, port, timeout, keepAlive }),
            };
        case 'tls':
            return {
                url,
                socket: new TlsSocket({ host, port, timeout, keepAlive }),
            };
        case 'tor':
            return {
                url,
                socket: new TorSocket({
                    host,
                    port,
                    timeout,
                    keepAlive,
                    tor: tor || TOR,
                }),
            };
        default:
            throw new CustomError('Invalid protocol');
    }
};
