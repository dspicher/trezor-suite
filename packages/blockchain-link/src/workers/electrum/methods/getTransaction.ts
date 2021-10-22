import { Api, distinct, flatten, sum, arrayToDic, btcToSat, scriptToScripthash } from '../utils';
import type { GetTransaction as Req } from '../../../types/messages';
import type { GetTransaction as Res } from '../../../types/responses';

const getTransaction: Api<Req, Res> = async (client, payload) => {
    const { txid, version, vin, vout, hex, blockhash, confirmations, blocktime, locktime } =
        await client.request('blockchain.transaction.get', payload, true);

    const prevOutputs = await Promise.all(
        vin
            .map(({ txid }) => txid) // Txids of tx inputs
            .filter(distinct)
            .map(txid => client.request('blockchain.transaction.get', txid, true))
    ).then(txs => arrayToDic(txs, tx => tx.txid));

    const unspentOutputs = await Promise.all(
        vout
            .map(({ scriptPubKey: { hex } }) => hex)
            .filter(distinct)
            .map(scriptToScripthash)
            .map(scripthash => client.request('blockchain.scripthash.listunspent', scripthash))
    )
        .then(flatten)
        .then(utxos => utxos.filter(({ tx_hash }) => tx_hash === txid))
        .then(utxos => utxos.map(({ tx_pos }) => tx_pos));

    const getVout = (txid: string, vout: number) => prevOutputs[txid].vout[vout];
    const value = vout.map(({ value }) => value).reduce(sum, 0);
    const valueIn = vin.map(({ txid, vout }) => getVout(txid, vout).value).reduce(sum, 0);

    const parseAddresses = ({ address, addresses }: { address?: string; addresses?: string[] }) => {
        const addrs = !address ? addresses || [] : [address];
        return {
            addresses: addrs,
            isAddress: addrs.length === 1,
        };
    };

    return {
        type: 'blockbook', // TODO electrum?
        tx: {
            txid,
            version,
            blockHash: blockhash,
            blockHeight: -1, // TODO,
            confirmations,
            blockTime: blocktime,
            value: btcToSat(value),
            valueIn: btcToSat(valueIn),
            fees: btcToSat(valueIn - value),
            hex,
            lockTime: locktime,
            vin: vin.map(({ txid, vout, sequence, n }, index) => ({
                txid,
                vout,
                sequence,
                n: n || index,
                value: btcToSat(getVout(txid, vout).value),
                ...parseAddresses(getVout(txid, vout).scriptPubKey),
            })),
            vout: vout.map(({ value, n, scriptPubKey }) => ({
                value: btcToSat(value),
                n,
                spent: !unspentOutputs.includes(n),
                hex: scriptPubKey.hex,
                ...parseAddresses(scriptPubKey),
            })),
        },
    };
};

export default getTransaction;
