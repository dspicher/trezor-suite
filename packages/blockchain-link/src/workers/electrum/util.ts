export const makeRequest = (method: string, params: any, id: number) =>
    JSON.stringify({
        jsonrpc: '2.0',
        method,
        params,
        id,
    });

export const createPromiseResult = (resolve, reject) => (err, result?) => {
    if (err) reject(err);
    else resolve(result);
};

type ParserCallback = (s: string | undefined, n: number) => void;

const createRecursiveParser = (maxDepth: number, delimiter: string) => {
    const MAX_DEPTH = maxDepth;
    const DELIMITER = delimiter;

    const recursiveParser = (
        n: number,
        buffer: string,
        callback: ParserCallback
    ): { code: number; buffer: string } => {
        if (buffer.length === 0) {
            return { code: 0, buffer };
        }
        if (n > MAX_DEPTH) {
            return { code: 1, buffer };
        }
        const xs = buffer.split(DELIMITER);
        if (xs.length === 1) {
            return { code: 0, buffer };
        }
        callback(xs.shift(), n);
        return recursiveParser(n + 1, xs.join(DELIMITER), callback);
    };
    return recursiveParser;
};

export class MessageParser {
    private buffer: string;
    private callback: ParserCallback;
    private recursiveParser: ReturnType<typeof createRecursiveParser>;

    constructor(callback: ParserCallback) {
        this.buffer = '';
        this.callback = callback;
        this.recursiveParser = createRecursiveParser(20, '\n');
    }

    run(chunk) {
        this.buffer += chunk;
        while (true) {
            const res = this.recursiveParser(0, this.buffer, this.callback);
            this.buffer = res.buffer;
            if (res.code === 0) {
                break;
            }
        }
    }
}
