import * as BitcoinJsAddress from '../address';
import type { CoinSelectInput, CoinSelectOutput } from '../coinselect';
import type { ComposeInput, ComposeOutput } from './request';
import type { Network } from '../networks';

// https://bitcoinops.org/en/tools/calc-size/

export const INPUT_SCRIPT_LENGTH = {
    p2pkh: 109,
    p2sh: 51, // 50.25
    p2tr: 17, // 57.5 - 41 (coinselect/utils/TX_INPUT_BASE),
    p2wsh: 27,
} as const;

export const OUTPUT_SCRIPT_LENGTH = {
    p2pkh: 25,
    p2sh: 23,
    p2tr: 34,
    p2wpkh: 22,
    p2wsh: 34,
} as const;

export type TxType = keyof typeof INPUT_SCRIPT_LENGTH;

export function convertInputs(
    inputs: ComposeInput[],
    height = 0,
    txType: TxType = 'p2pkh',
): CoinSelectInput[] {
    return inputs.map((input, i) => ({
        i,
        script: { length: INPUT_SCRIPT_LENGTH[txType] },
        value: input.value,
        own: input.own,
        coinbase: input.coinbase,
        confirmations: input.height == null ? 0 : 1 + height - input.height,
        required: input.required,
    }));
}

export function getScriptFromAddress(address: string, network: Network) {
    let length: number;
    try {
        const decoded = BitcoinJsAddress.fromBech32(address);
        if (decoded.version === 1) {
            length = OUTPUT_SCRIPT_LENGTH.p2tr;
        } else {
            length =
                decoded.data.length === 20
                    ? OUTPUT_SCRIPT_LENGTH.p2wpkh
                    : OUTPUT_SCRIPT_LENGTH.p2wsh;
        }

        return { length };
    } catch (e) {
        // empty
    }

    const decoded = BitcoinJsAddress.fromBase58Check(address, network);
    length =
        decoded.version === network.pubKeyHash
            ? OUTPUT_SCRIPT_LENGTH.p2pkh
            : OUTPUT_SCRIPT_LENGTH.p2sh;
    return { length };
}

export function convertOutputs(
    outputs: ComposeOutput[],
    network: Network,
    txType: TxType = 'p2pkh',
): CoinSelectOutput[] {
    const script = { length: OUTPUT_SCRIPT_LENGTH[txType] };
    return outputs.map(output => {
        if (output.type === 'complete') {
            return {
                value: output.amount,
                script: getScriptFromAddress(output.address, network),
            };
        }
        if (output.type === 'noaddress') {
            return {
                value: output.amount,
                script,
            };
        }
        if (output.type === 'opreturn') {
            return {
                value: '0',
                script: { length: 2 + output.dataHex.length / 2 },
            };
        }
        if (output.type === 'send-max') {
            return {
                script: getScriptFromAddress(output.address, network),
            };
        }
        if (output.type === 'send-max-noaddress') {
            return {
                script,
            };
        }
        throw new Error('WRONG-OUTPUT-TYPE');
    });
}
