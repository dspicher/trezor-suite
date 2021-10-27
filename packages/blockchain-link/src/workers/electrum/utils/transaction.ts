import { arrayToDic, flatten, distinct, sum } from './misc';
import { scriptToScripthash, btcToSat } from './transform';
import type { Transaction as BlockbookTransaction } from '../../../types/blockbook';
import type { ElectrumAPI, TransactionVerbose } from '../api';

const parseAddresses = ({ address, addresses }: { address?: string; addresses?: string[] }) => {
    const addrs = !address ? addresses || [] : [address];
    return {
        addresses: addrs,
        isAddress: addrs.length === 1,
    };
};

type GetVout = (txid: string, vout: number) => TransactionVerbose['vout'][number];
type GetSpent = (txid: string, n: number) => boolean;

const formatTransaction =
    (getVout: GetVout, getSpent: GetSpent, currentHeight: number) =>
    (tx: TransactionVerbose): BlockbookTransaction => {
        const { txid, version, vin, vout, hex, blockhash, confirmations, blocktime, locktime } = tx;
        const value = vout.map(({ value }) => value).reduce(sum, 0);
        const valueIn = vin.map(({ txid, vout }) => getVout(txid, vout).value).reduce(sum, 0);
        return {
            txid,
            hex,
            version,
            confirmations,
            lockTime: locktime,
            blockTime: blocktime,
            blockHash: blockhash,
            blockHeight: currentHeight ? currentHeight - confirmations + 1 : -1, // TODO check,
            value: btcToSat(value),
            valueIn: btcToSat(valueIn),
            fees: btcToSat(valueIn - value),
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
                spent: getSpent(txid, n),
                hex: scriptPubKey.hex,
                ...parseAddresses(scriptPubKey),
            })),
        };
    };

export const getTransactions = async (
    client: ElectrumAPI,
    txids: string[]
): Promise<BlockbookTransaction[]> => {
    const origTxs = await Promise.all(
        txids.map(txid => client.request('blockchain.transaction.get', txid, true))
    ).then(txs => arrayToDic(txs, ({ txid }) => txid));

    const prevTxs = await Promise.all(
        flatten(Object.values(origTxs).map(({ vin }) => vin.map(({ txid }) => txid)))
            .filter(distinct)
            .filter(txid => !origTxs[txid])
            .map(txid => client.request('blockchain.transaction.get', txid, true))
    ).then(txs => arrayToDic(txs, ({ txid }) => txid));

    const unspentOutputs = await Promise.all(
        flatten(
            Object.values(origTxs).map(({ vout }) => vout.map(({ scriptPubKey: { hex } }) => hex))
        )
            .filter(distinct)
            .map(scriptToScripthash)
            .map(scripthash => client.request('blockchain.scripthash.listunspent', scripthash))
    )
        .then(flatten)
        .then(utxos =>
            utxos
                .filter(({ tx_hash }) => origTxs[tx_hash])
                .reduce(
                    (dic, { tx_hash, tx_pos }) => ({
                        ...dic,
                        [tx_hash]: [...(dic[tx_hash] || []), tx_pos],
                    }),
                    {} as { [txid: string]: number[] }
                )
        );

    const getTx = (txid: string) => origTxs[txid] || prevTxs[txid];
    const getVout = (txid: string, vout: number) => getTx(txid).vout[vout];
    const getSpent = (txid: string, n: number) => !unspentOutputs[txid]?.includes(n);

    const currentHeight = client.getInfo()?.block?.height || 0;

    return Object.values(origTxs).map(formatTransaction(getVout, getSpent, currentHeight));
};
