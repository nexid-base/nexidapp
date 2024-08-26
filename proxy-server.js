const express = require('express');
const cors = require('cors');
const path = require('path');
const { Alchemy, Network } = require('alchemy-sdk');
const { ethers } = require('ethers');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Set Content Security Policy
app.use((req, res, next) => {
    res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdn.ethers.io; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://base-mainnet.g.alchemy.com"
    );
    next();
});

const config = {
    apiKey: process.env.ALCHEMY_API_KEY,
    network: Network.BASE_MAINNET,
};
const alchemy = new Alchemy(config);

// Base-specific ENS resolver contract
const BASE_ENS_RESOLVER = '0x4976fb03C32e5B8cfe2b6cCB31c09Ba78EBaBa41';
const baseProvider = new ethers.JsonRpcProvider('https://mainnet.base.org');

async function resolveAddress(addressOrName) {
    console.log('Resolving address or name:', addressOrName);
    try {
        if (ethers.isAddress(addressOrName)) {
            return ethers.getAddress(addressOrName);
        } else if (addressOrName.endsWith('.eth')) {
            // Use Base-specific ENS resolution
            const resolverContract = new ethers.Contract(
                BASE_ENS_RESOLVER,
                ['function resolve(bytes memory name, bytes memory data) external view returns (bytes memory)'],
                baseProvider
            );
            const namehash = ethers.namehash(addressOrName);
            const addrFunctionSelector = '0x3b3b57de'; // keccak256('addr(bytes32)').slice(0, 10)
            try {
                const resolvedData = await resolverContract.resolve(ethers.hexlify(ethers.toUtf8Bytes(addressOrName)), addrFunctionSelector);
                if (resolvedData === '0x') {
                    throw new Error(`ENS name not found: ${addressOrName}`);
                }
                const address = ethers.getAddress('0x' + resolvedData.slice(66)); // 66 = 2 (0x) + 64 (32 bytes)
                if (address !== ethers.ZeroAddress) {
                    return address;
                }
            } catch (error) {
                console.error('Error resolving ENS name:', error);
                throw new Error(`Unable to resolve ENS name: ${addressOrName}`);
            }
        }
        throw new Error(`Invalid address or ENS name: ${addressOrName}`);
    } catch (error) {
        console.error('Error in resolveAddress:', error);
        throw error;
    }
}

app.get('/proxy/identity', async (req, res) => {
    try {
        const { address } = req.query;
        const resolvedAddress = await resolveAddress(address);

        const [balance, code, tokenBalances, nfts] = await Promise.all([
            alchemy.core.getBalance(resolvedAddress),
            alchemy.core.getCode(resolvedAddress),
            alchemy.core.getTokenBalances(resolvedAddress),
            alchemy.nft.getNftsForOwner(resolvedAddress)
        ]);

        const tokenMetadata = await Promise.all(
            tokenBalances.tokenBalances.map(token => 
                alchemy.core.getTokenMetadata(token.contractAddress)
            )
        );

        const enhancedTokenBalances = tokenBalances.tokenBalances.map((token, index) => ({
            ...token,
            metadata: tokenMetadata[index],
            formattedBalance: ethers.formatUnits(
                token.tokenBalance,
                tokenMetadata[index].decimals
            )
        }));

        const response = {
            address: resolvedAddress,
            balance: ethers.formatEther(balance.toString()),
            isContract: code !== '0x',
            tokens: enhancedTokenBalances,
            nfts: nfts.ownedNfts.map(nft => ({
                ...nft,
                media: nft.media || [],
                image: {
                    gateway: nft.image?.gateway || nft.media?.[0]?.gateway || null
                }
            }))
        };

        res.json(response);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/proxy/tokensupply', async (req, res) => {
    try {
        const { contractAddress } = req.query;
        const totalSupply = await alchemy.core.getTokenSupply(contractAddress);
        res.json({ totalSupply: totalSupply.totalSupply });
    } catch (error) {
        console.error('Error fetching token supply:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/proxy/transactioncount', async (req, res) => {
    try {
        const { address } = req.query;
        const txCount = await alchemy.core.getTransactionCount(address);
        res.json({ txCount });
    } catch (error) {
        console.error('Error fetching transaction count:', error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Application specific logging, throwing an error, or other logic here
});