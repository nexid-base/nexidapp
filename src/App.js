import React, { useState, useCallback, useMemo } from 'react';
import { Alchemy, Network } from 'alchemy-sdk';
import { formatEther, formatUnits, parseUnits } from '@ethersproject/units';
import { useOnchainKit } from '@coinbase/onchainkit';
import { base } from 'viem/chains';
import styles from './App.module.css';

// Configure Alchemy SDK
const config = {
  apiKey: process.env.REACT_APP_ALCHEMY_API_KEY,
  network: Network.BASE_MAINNET,
};
const alchemy = new Alchemy(config);

// BaseScan API key for additional data fetching
const BASESCAN_API_KEY = process.env.REACT_APP_BASESCAN_API_KEY;

/**
 * Helper function to safely calculate percentage using BigInt
 * @param {string} balance - The token balance
 * @param {string} totalSupply - The total supply of the token
 * @returns {number} The calculated percentage
 */
const calculatePercentage = (balance, totalSupply) => {
  if (typeof BigInt !== 'undefined') {
    try {
      const percentage = (BigInt(balance) * BigInt(100)) / BigInt(totalSupply);
      return Number(percentage);
    } catch (error) {
      console.error('Error in BigInt calculation:', error);
    }
  }
  // Fallback to regular number calculation
  return (Number(balance) / Number(totalSupply)) * 100;
};

/**
 * Helper function to categorize address based on transaction count
 * @param {number} txCount - The number of transactions
 * @returns {string} The category of the address
 */
const categorizeAddress = (txCount) => {
  if (txCount < 10) return 'Plankton';
  if (txCount < 100) return 'Shrimp';
  if (txCount < 1000) return 'Dolphin';
  if (txCount < 10000) return 'Shark';
  return 'Whale';
};

/**
 * Basename component to display the Base Name of an address
 * @param {Object} props - Component props
 * @param {string} props.address - The Ethereum address
 */
const Basename = ({ address }) => {
  const { name } = useOnchainKit({ address, chainId: base.id });
  return <span>{name || 'No Base Name set'}</span>;
};

/**
 * AddressDisplay component to display the address
 * @param {Object} props - Component props
 * @param {string} props.address - The Ethereum address
 */
const AddressDisplay = ({ address }) => {
  return <span>{address}</span>;
};

/**
 * Main App component
 */
const App = () => {
  // State management
  const [address, setAddress] = useState('');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [expandedSections, setExpandedSections] = useState({
    addressInfo: true,
    tokenBalances: true,
    nfts: true,
    analysis: true
  });

  /**
   * Fetch address details including balance, tokens, and NFTs
   * @param {string} address - The Ethereum address to fetch details for
   */
  const fetchAddressDetails = useCallback(async (address) => {
    const [balance, tokenBalances, nfts] = await Promise.all([
      alchemy.core.getBalance(address),
      alchemy.core.getTokenBalances(address),
      alchemy.nft.getNftsForOwner(address),
    ]);

    // Enhance token balances with metadata
    const enhancedTokenBalances = await Promise.all(tokenBalances.tokenBalances.map(async (token) => {
      const metadata = await alchemy.core.getTokenMetadata(token.contractAddress);
      return {
        ...token,
        metadata,
        formattedBalance: formatUnits(token.tokenBalance, metadata.decimals)
      };
    }));

    // Filter out tokens with negligible balance
    const nonZeroTokens = enhancedTokenBalances.filter(token => parseFloat(token.formattedBalance) > 0.0001);

    return {
      address,
      balance: formatEther(balance),
      tokenBalances: nonZeroTokens,
      nfts: nfts.ownedNfts
    };
  }, []);

  /**
   * Handle search form submission
   * @param {Event} e - The form submit event
   */
  const handleSearch = useCallback(async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setReport(null);
    setAnalysis(null);

    try {
      const details = await fetchAddressDetails(address);
      setReport(details);
    } catch (err) {
      setError('Error fetching address details. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [address, fetchAddressDetails]);

  /**
   * Perform detailed analysis on tokens and NFTs
   */
  const performAnalysis = useCallback(async () => {
    if (!report) return;

    setLoading(true);
    setError('');
    setAnalysis(null);

    try {
      const insiderTokens = [];
      // Analyze token holdings
      for (const token of report.tokenBalances) {
        const response = await fetch(`https://api.basescan.org/api?module=stats&action=tokensupply&contractaddress=${token.contractAddress}&apikey=${BASESCAN_API_KEY}`);
        const data = await response.json();
        if (data.status === '1') {
          const totalSupply = parseUnits(data.result, token.metadata.decimals).toString();
          const userBalance = parseUnits(token.formattedBalance, token.metadata.decimals).toString();
          const percentage = calculatePercentage(userBalance, totalSupply);
          
          // Filter out likely scams (total supply of 0 or 1) and insignificant holdings
          if (Number(totalSupply) > 1 && percentage > 0.01) {
            insiderTokens.push({
              name: token.metadata.name,
              symbol: token.metadata.symbol,
              balance: token.formattedBalance,
              totalSupply: formatUnits(totalSupply, token.metadata.decimals),
              percentage: percentage.toFixed(2)
            });
          }
        }
      }

      // Group NFTs by collection
      const nftCollections = report.nfts.reduce((acc, nft) => {
        const collectionName = nft.contract.name || nft.contract.address;
        if (!acc[collectionName]) {
          acc[collectionName] = {
            name: collectionName,
            count: 1,
            nfts: [nft],
            openseaUrl: `https://opensea.io/assets/${nft.contract.address}`
          };
        } else {
          acc[collectionName].count++;
          acc[collectionName].nfts.push(nft);
        }
        return acc;
      }, {});

      // Fetch transaction count
      const txCountResponse = await fetch(`https://api.basescan.org/api?module=proxy&action=eth_getTransactionCount&address=${report.address}&tag=latest&apikey=${BASESCAN_API_KEY}`);
      const txCountData = await txCountResponse.json();
      const txCount = parseInt(txCountData.result, 16);
      const category = categorizeAddress(txCount);

      setAnalysis({ 
        insiderTokens, 
        nftCollections: Object.values(nftCollections),
        transactionCount: txCount,
        category
      });
    } catch (err) {
      setError('Error performing analysis. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [report]);

  /**
   * Toggle section expansion
   * @param {string} section - The section to toggle
   */
  const toggleSection = useCallback((section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  }, []);

  /**
   * Reusable component for collapsible sections
   */
  const ReportSection = useMemo(() => ({ title, content, sectionKey }) => (
    <div className={styles.section}>
      <h2 onClick={() => toggleSection(sectionKey)} className={styles.sectionHeader}>
        {title}
        <span className={styles.expandIcon}>{expandedSections[sectionKey] ? '▼' : '▶'}</span>
      </h2>
      {expandedSections[sectionKey] && (
        <div className={styles.sectionContent}>
          {content}
        </div>
      )}
    </div>
  ), [expandedSections, toggleSection]);

  return (
    <div className={styles.app}>
      <div className={styles.container}>
        <h1>NexID - Base Identity Report</h1>
        <form onSubmit={handleSearch} className={styles.searchForm}>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Enter Ethereum address"
            className={styles.searchInput}
          />
          <button type="submit" className={styles.searchButton} disabled={loading}>
            {loading ? 'Searching...' : 'Search'}
          </button>
        </form>
        {error && <p className={styles.error}>{error}</p>}
        {report && (
          <div className={styles.report}>
            <ReportSection
              title="Address Information"
              sectionKey="addressInfo"
              content={
                <>
                  <p><strong>Address:</strong> <AddressDisplay address={report.address} /></p>
                  <p><strong>Base Name:</strong> <Basename address={report.address} /></p>
                  <p><strong>Balance:</strong> {report.balance} ETH</p>
                </>
              }
            />
            <ReportSection
              title="Token Balances"
              sectionKey="tokenBalances"
              content={
                <div className={styles.gridContent}>
                  {report.tokenBalances.map((token, index) => (
                    <div key={index} className={styles.tokenItem}>
                      <img 
                        src={token.metadata.logo || '/placeholder-token.png'} 
                        alt={token.metadata.name} 
                        className={styles.tokenImage}
                      />
                      <strong>{token.metadata.name}</strong>
                      <p>{parseFloat(token.formattedBalance).toFixed(4)} {token.metadata.symbol}</p>
                    </div>
                  ))}
                </div>
              }
            />
            <ReportSection
              title="NFTs"
              sectionKey="nfts"
              content={
                <div className={styles.gridContent}>
                  {report.nfts.map((nft, index) => (
                    <div key={index} className={styles.nftItem}>
                      <img 
                        src={nft.media[0]?.gateway || '/placeholder-nft.png'} 
                        alt={nft.title} 
                        className={styles.nftImage}
                      />
                      <p>{nft.title || 'Unnamed NFT'}</p>
                      <p>ID: {nft.tokenId}</p>
                    </div>
                  ))}
                </div>
              }
            />
            <ReportSection
              title="Analysis"
              sectionKey="analysis"
              content={
                <>
                  {!analysis && (
                    <button onClick={performAnalysis} className={styles.analyzeButton} disabled={loading}>
                      {loading ? 'Analyzing...' : 'Perform Analysis'}
                    </button>
                  )}
                  {analysis && (
                    <>
                      <h3>Transaction Analysis</h3>
                      <p>Transaction Count: {analysis.transactionCount}</p>
                      <p>Category: {analysis.category}</p>
                      <h3>Significant Token Holdings</h3>
                      <div className={styles.gridContent}>
                        {analysis.insiderTokens.map((token, index) => (
                          <div key={index} className={styles.tokenItem}>
                            <strong>{token.name}</strong>
                            <p>{token.symbol}</p>
                            <p>Balance: {parseFloat(token.balance).toFixed(4)}</p>
                            <p>Total Supply: {parseFloat(token.totalSupply).toFixed(0)}</p>
                            <p>{token.percentage}% of total supply</p>
                          </div>
                        ))}
                      </div>
                      <h3>NFT Collections</h3>
                      <div className={styles.gridContent}>
                        {analysis.nftCollections.map((collection, index) => (
                          <div 
                            key={index} 
                            className={styles.nftCollectionItem} 
                            onClick={() => window.open(`https://opensea.io/collection/${collection.name.toLowerCase().replace(/\s+/g, '-')}`, '_blank')}
                          >
                            <strong>{collection.name}</strong>
                            <p>{collection.count} NFTs</p>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              }
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default App;