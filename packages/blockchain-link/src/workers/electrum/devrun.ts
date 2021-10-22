import type { Message, Response } from '../../types';

const TCP_CONFIG = 'tcp://electrumx.erbium.eu:50001';
const TLS_CONFIG = 'tls://electrumx.erbium.eu:50002';
const TOR_CONFIG = ''; // My personal Umbrel

const ADDR_LEGACY = '1BitcoinEaterAddressDontSendf59kuE';
const ADDR_SEGWIT = '3AVjhFvVHKhPfFccdFnPTBaqRqWq4EWoU2';
const ADDR_BECH32 = 'bc1qwqdg6squsna38e46795at95yu9atm8azzmyvckulcc7kytlcckxswvvzej';
const XPUB_ALL_SEED_1 =
    'xpub6BiVtCpG9fQPxnPmHXG8PhtzQdWC2Su4qWu6XW9tpWFYhxydCLJGrWBJZ5H6qTAHdPQ7pQhtpjiYZVZARo14qHiay2fvrX996oEP42u8wZy';
const XPUB_ALL_SEED_2 =
    'xpub6BiVtCpG9fQQ1EW99bMSYwySbPWvzTFRQZCFgTmV3samLSZAYU7C3f4Je9vkNh7h1GAWi5Fn93BwoGBy9EAXbWTTgTnVKAbthHpxM1fXVRL';
const YPUB =
    'ypub6XKbB5DSkq8Royg8isNtGktj6bmEfGJXDs83Ad5CZ5tpDV8QofwSWQFTWP2Pv24vNdrPhquehL7vRMvSTj2GpKv6UaTQCBKZALm6RJAmxG6';
const ZPUB =
    'zpub6rDjzkRoJEhB4Z4j77umtwDFpuqDhNxWy85wZZwF6z7TM1TUw1oCucRsPHjeVNCPa29EXxFbzoPCSSbdcR66KUh9R7oPWD7XQtHuVSy47mk';
const ZPUB_FIRST = 'bc1qqmu7jr0twysm6n0zd3xz93h3jysre8aaatd6g8';
const ZPUB_SECOND = 'bc1qrhl9v6nagn9v9ckg4u63vwgzteh5wzdutj2ecd';
const TX = '353cad24cf028dc32d7be44d9b96acc112dba7705a4f3bba4be077f500cdc416';
const OP_RETURN_TX = '8bae12b5f4c088d940733dcd1455efc6a3a69cf9340e17a981286d3778615684';
const MULTISIG_TX = 'aafbce314cadd619585034c4d949a59569fcf79902d3c35e162d25aa207dfb61';

const SCRIPTHASH = '495fa456cdb66064db3dae04d7b2f307a874cb6f731ab4251b7d73308001ebba';

let resolver: (value: any) => void;

global.postMessage = (data: Response) => {
    console.log('POST_MESSAGE', JSON.stringify(data, null, 4));
    if (resolver) resolver(data);
};

// const addrsRecv = deriveAddresses(XPUB_ALL_SEED_2, 'receive', 0, 5);

import('./index').then(async worker => {
    let id = 0;
    const sendAndWait = (data: Message) =>
        new Promise((resolve, reject) => {
            resolver = resolve;
            worker.onmessage({ data });
        });

    worker.onmessage({
        data: {
            type: 'm_handshake',
            id: 0,
            settings: {
                name: 'Electrum',
                worker: 'unknown',
                server: [TOR_CONFIG],
                debug: true,
            },
        },
    });
    await sendAndWait({ id: ++id, type: 'm_connect' });
    /* await sendAndWait({
        id: ++id,
        // @ts-ignore
        type: 'raw',
        // @ts-ignore
        payload: {
            method: 'blockchain.block.headers',
            params: [666666, 3],
        },
    });
    return;
    await sendAndWait({ id: ++id, type: 'm_get_info' });
    await sendAndWait({ id: ++id, type: 'm_get_account_utxo', payload: ZPUB });
    */
    await sendAndWait({
        id: ++id,
        type: 'm_subscribe',
        payload: { addresses: [ZPUB_FIRST], type: 'addresses' },
    });
    return;
    await sendAndWait({ id: ++id, type: 'm_get_block_hash', payload: 666666 });
    await sendAndWait({ id: ++id, type: 'm_get_transaction', payload: TX });
    return;

    await sendAndWait({
        id: ++id,
        // @ts-ignore
        type: 'raw',
        // @ts-ignore
        payload: {
            method: 'server.ping',
        },
    });

    return;
    await sendAndWait({
        id: ++id,
        type: 'm_get_account_info',
        payload: { descriptor: XPUB_ALL_SEED_2, details: 'tokens' },
    });
    return;
    await sendAndWait({
        id: ++id,
        type: 'm_get_account_balance_history',
        payload: { descriptor: ADDR_SEGWIT, from: 0, to: 0 },
    });
    await sendAndWait({ id: ++id, type: 'm_estimate_fee', payload: { blocks: [1, 2, 10] } });
});
