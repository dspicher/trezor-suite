import * as typef from 'typeforce';
import * as bs58check from '../bs58check';
import { decred as DECRED_NETWORK } from '../networks';
import * as bscript from '../script';
import * as lazy from './lazy';
import type { Payment, PaymentOpts, Stack } from './index';

const { OPS } = bscript;

// Decred
// OP_SSTX OP_DUP OP_HASH160 {pubKeyHash} OP_EQUALVERIFY OP_CHECKSIG

export function sstxpkh(a: Payment, opts?: PaymentOpts): Payment {
    if (!a.address && !a.hash && !a.output) throw new TypeError('Not enough data');

    opts = Object.assign({ validate: true }, opts || {});

    typef(
        {
            network: typef.maybe(typef.Object),
            address: typef.maybe(typef.String),
            hash: typef.maybe(typef.BufferN(20)),
            output: typef.maybe(typef.Buffer),
        },
        a,
    );

    const _address = lazy.value(() => {
        const payload = bs58check.decodeBlake256(a.address!);
        const version = payload.readUInt8(0);
        const hash = payload.slice(2);
        return { version, hash };
    });

    const network = a.network || DECRED_NETWORK;
    const o = { name: 'sstxpkh', network } as Payment;

    lazy.prop(o, 'address', () => {
        if (!o.hash) return;
        return bs58check.encodeMultibytePayload(o.hash, network.pubKeyHash, network);
    });
    lazy.prop(o, 'hash', () => {
        if (a.output) return a.output.slice(3, 23);
        if (a.address) return _address().hash;
    });
    lazy.prop(o, 'output', () => {
        if (!a.hash) return;
        return bscript.compile([
            OPS.OP_SSTX,
            OPS.OP_DUP,
            OPS.OP_HASH160,
            a.hash,
            OPS.OP_EQUALVERIFY,
            OPS.OP_CHECKSIG,
        ] as Stack);
    });

    // extended validation
    if (opts.validate) {
        if (a.output) {
            const chunks = bscript.decompile(a.output);
            const isValid =
                chunks.length === 26 &&
                chunks[0] === OPS.OP_SSTX &&
                chunks[1] === OPS.OP_DUP &&
                chunks[2] === OPS.OP_HASH160 &&
                chunks[3] === 0x14 &&
                chunks[24] === OPS.OP_EQUALVERIFY &&
                chunks[25] === OPS.OP_CHECKSIG;
            if (!isValid) throw new TypeError('SSTXChange Output is invalid');
        }
    }

    return Object.assign(o, a);
}
