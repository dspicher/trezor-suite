import { decode } from 'bs58';
import { payments, bip32 } from '@trezor/utxo-lib';
import { fail } from './misc';

const BIP32_VERSIONS = {
    0x0488b21e: '44', // 76067358, xpub
    0x049d7cb2: '49', // 77429938, ypub
    0x04b24746: '84', // 78792518, zpub
} as const;

type Version = keyof typeof BIP32_VERSIONS;

const validateVersion = (version: number): version is Version => !!BIP32_VERSIONS[version];

const addressFromPubkey = (network: ReturnType<typeof getNetwork>) => (pubkey: Buffer) => {
    const err = () => fail('Cannot convert pubkey to address');
    switch (network.bip32.public) {
        case 0x0488b21e:
            return payments.p2pkh({ pubkey, network }).address || err();
        case 0x049d7cb2:
            return (
                payments.p2sh({
                    redeem: payments.p2wpkh({
                        pubkey,
                        network,
                    }),
                    network,
                }).address || err()
            );
        case 0x04b24746:
            return payments.p2wpkh({ pubkey, network }).address || err();
        default:
            throw new Error(`Unknown xpub version: ${network.bip32.public}`);
    }
};

const getNetwork = (version: Version) => ({
    messagePrefix: '\x18Bitcoin Signed Message:\n',
    bech32: 'bc',
    bip32: {
        public: version,
        private: 0x0488ade4,
    },
    pubKeyHash: 0x00,
    scriptHash: 0x05,
    wif: 0x80,
});

type Address = {
    address: string;
    path: string;
};

export const deriveAddresses = (
    xpub: string,
    type: 'receive' | 'change',
    from: number,
    count: number
): Address[] => {
    const version = decode(xpub).readUInt32BE();
    if (!validateVersion(version)) throw new Error(`Unknown xpub version: ${version}`);
    const network = getNetwork(version);
    const node = bip32.fromBase58(xpub, network);
    // eslint-disable-next-line
    const account = (node.index << 1) >>> 1; // Unsigned to signed conversion
    const change = type === 'receive' ? 0 : 1;
    const typeNode = node.derive(change);
    return Array.from(Array(count).keys())
        .map(i => typeNode.derive(from + i).publicKey)
        .map(addressFromPubkey(network))
        .map((address, i) => ({
            address,
            path: `m/${BIP32_VERSIONS[version]}'/0'/${account}'/${change}/${from + i}`,
        }));
};
