// Global variables
let currentAccount = null;
let web3;

// Initialize the application when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', initApp);

function initApp() {
    const searchBtn = document.getElementById('searchBtn');
    const addressInput = document.getElementById('addressInput');

    if (searchBtn && addressInput) {
        searchBtn.addEventListener('click', handleSearch);
        addressInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleSearch();
        });
    } else {
        console.error('Search button or address input not found');
    }

    initWalletConnection();
    initExportFunctionality();
}

function initWalletConnection() {
    const walletBtn = document.getElementById('walletBtn');
    const walletModal = document.getElementById('walletModal');
    const walletOptions = document.querySelectorAll('.wallet-option');
    const walletAddressSpan = document.getElementById('walletAddress');

    if (!walletBtn || !walletModal || !walletOptions.length || !walletAddressSpan) {
        console.error('Wallet connection elements not found');
        return;
    }

    walletBtn.addEventListener('click', () => {
        if (currentAccount) {
            disconnectWallet();
        } else {
            walletModal.style.display = 'block';
        }
    });

    walletOptions.forEach(option => {
        option.addEventListener('click', async () => {
            const walletType = option.getAttribute('data-wallet');
            await connectWallet(walletType);
            walletModal.style.display = 'none';
        });
    });

    window.addEventListener('click', (event) => {
        if (event.target === walletModal) {
            walletModal.style.display = 'none';
        }
    });

    if (window.ethereum) {
        window.ethereum.on('accountsChanged', handleAccountsChanged);
        window.ethereum.on('chainChanged', () => window.location.reload());
    }
}

async function connectWallet(walletType) {
    if (walletType === 'metamask') {
        if (typeof window.ethereum !== 'undefined') {
            try {
                const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
                handleAccountsChanged(accounts);
            } catch (error) {
                console.error('Failed to connect wallet:', error);
                showError(`Failed to connect wallet: ${error.message}`);
            }
        } else {
            console.error('MetaMask is not installed');
            showError('MetaMask is not installed. Please install it to use this feature.');
        }
    }
}

function disconnectWallet() {
    currentAccount = null;
    updateWalletDisplay();
}

function handleAccountsChanged(accounts) {
    if (accounts.length === 0) {
        console.log('Please connect to MetaMask.');
        currentAccount = null;
    } else if (accounts[0] !== currentAccount) {
        currentAccount = accounts[0];
        console.log('Current account:', currentAccount);
    }
    updateWalletDisplay();
}

function updateWalletDisplay() {
    const walletBtn = document.getElementById('walletBtn');
    const walletAddressSpan = document.getElementById('walletAddress');

    if (currentAccount) {
        walletAddressSpan.textContent = `Connected: ${truncateAddress(currentAccount)}`;
        walletBtn.textContent = 'Disconnect';
    } else {
        walletAddressSpan.textContent = '';
        walletBtn.textContent = 'Connect Wallet';
    }
}

function handleSearch() {
    const addressInput = document.getElementById('addressInput');
    if (!addressInput) {
        console.error('Address input not found');
        return;
    }

    let address = addressInput.value.trim();

    if (!address && currentAccount) {
        address = currentAccount;
    }

    if (!address) {
        showError('Please enter an address or connect a wallet.');
        return;
    }

    clearError();
    fetchIdentityReport(address);
}

async function fetchIdentityReport(address) {
    const reportContainer = document.getElementById('report');
    if (!reportContainer) {
        console.error('Report container not found');
        return;
    }

    reportContainer.innerHTML = '<p>Loading...</p>';

    try {
        const response = await fetch(`/api/identity?address=${encodeURIComponent(address)}`);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Network response was not ok: ${response.status} ${response.statusText}\n${errorText}`);
        }
        const data = await response.json();
        displayReport(data);
    } catch (error) {
        console.error('Error:', error);
        reportContainer.innerHTML = `<p>Error fetching identity report: ${error.message}</p>`;
        showError(`Failed to fetch identity report: ${error.message}`);
    }
}

function displayReport(data) {
    const reportContainer = document.getElementById('report');
    reportContainer.innerHTML = `
        <div class="section" id="addressSection">
            <h2>Address Information</h2>
            <div class="section-content">
                <p><strong>Address:</strong> <a href="${createBasescanUrl(data.address)}" target="_blank">${data.address}</a></p>
                <p><strong>ETH Balance:</strong> ${parseFloat(data.balance).toFixed(4)} ETH</p>
                <p><strong>Is Contract:</strong> ${data.isContract ? 'Yes' : 'No'}</p>
            </div>
        </div>

        <div class="section" id="tokenSection">
            <h2>Token Balances</h2>
            <div class="section-content">
                <div id="tokenList" class="token-list"></div>
            </div>
        </div>

        <div class="section" id="nftSection">
            <h2>NFTs</h2>
            <div class="section-content">
                <div id="nftList" class="nft-list"></div>
            </div>
        </div>

        <div class="section" id="analysisSection">
            <h2>Analysis</h2>
            <div class="section-content">
                <button id="performAnalysisBtn">Perform Analysis</button>
                <div id="analysisResults"></div>
            </div>
        </div>
    `;

    displayTokenBalances(data.tokens);
    displayNFTs(data.nfts);
    initCollapsibleSections();
    
    const analysisBtn = document.getElementById('performAnalysisBtn');
    if (analysisBtn) {
        analysisBtn.addEventListener('click', () => performAnalysis(data));
    }
}

function displayNFTs(nfts) {
    const nftList = document.getElementById('nftList');
    if (nfts && nfts.length > 0) {
        nftList.innerHTML = nfts.map(nft => {
            const title = nft.title || nft.name || 'Unnamed NFT';
            const description = nft.description || 'No description';
            const imageUrl = nft.image?.gateway || nft.image?.url || nft.media?.[0]?.gateway || '/placeholder-nft.png';
            const tokenId = nft.tokenId || 'Unknown';
            const contractAddress = nft.contract?.address || 'Unknown';

            return `
                <div class="nft-item">
                    <img src="${imageUrl}" alt="${title}" class="nft-image" onerror="this.onerror=null; this.src='/placeholder-nft.png';">
                    <p><strong>${truncateString(title, 20)}</strong></p>
                    <p>Token ID: <a href="${createBasescanTokenUrl(contractAddress, tokenId)}" target="_blank">${truncateString(tokenId, 10)}</a></p>
                    <p>Description: ${truncateString(description, 50)}</p>
                    <p>Contract: <a href="${createBasescanUrl(contractAddress)}" target="_blank">${truncateAddress(contractAddress)}</a></p>
                </div>
            `;
        }).join('');
    } else {
        nftList.innerHTML = '<p>No NFTs found</p>';
    }
}

async function performAnalysis(data) {
    const analysisResults = document.getElementById('analysisResults');
    if (!analysisResults) {
        console.error('Analysis results element not found');
        return;
    }
    analysisResults.innerHTML = '<p>Analyzing... This may take a while due to API rate limits.</p>';

    try {
        const results = [];

        // Analyze token holdings
        results.push('<div class="analysis-section token-analysis">');
        if (data.tokens && data.tokens.length > 0) {
            try {
                const significantTokens = await analyzeTokenHoldings(data.tokens);
                if (significantTokens.length > 0) {
                    results.push('<h3>Significant Token Holdings (Potential Insider)</h3>');
                    results.push('<ul>');
                    significantTokens.forEach(token => {
                        results.push(`<li>${token.name}: ${token.percentage}% of total supply</li>`);
                    });
                    results.push('</ul>');
                } else {
                    results.push('<p>No significant token holdings found.</p>');
                }
            } catch (error) {
                results.push(`<p>Error analyzing token holdings: ${error.message}</p>`);
            }
        } else {
            results.push('<p>No token data available for analysis.</p>');
        }
        results.push('</div>');

        // Analyze NFT collections
        results.push('<div class="analysis-section nft-analysis">');
        if (data.nfts && data.nfts.length > 0) {
            const nftCollections = analyzeNFTCollections(data.nfts);
            results.push('<h3>NFT Collections</h3>');
            results.push('<ul>');
            Object.entries(nftCollections).forEach(([collection, count]) => {
                results.push(`<li>${collection}: ${count} NFTs</li>`);
            });
            results.push('</ul>');
        } else {
            results.push('<p>No NFTs found.</p>');
        }
        results.push('</div>');

        // Analyze transaction count
        results.push('<div class="analysis-section transaction-analysis">');
        try {
            const txCount = await getTransactionCount(data.address);
            const userCategory = categorizeUser(txCount);
            results.push('<h3>Transaction Analysis</h3>');
            results.push(`<p><strong>Transaction Count:</strong> ${txCount}</p>`);
            results.push(`<p><strong>User Category:</strong> ${userCategory}</p>`);
        } catch (error) {
            results.push(`<p>Unable to fetch transaction count: ${error.message}</p>`);
        }
        results.push('</div>');

        analysisResults.innerHTML = results.join('');
    } catch (error) {
        console.error('Error performing analysis:', error);
        analysisResults.innerHTML = `<p>Error performing analysis: ${error.message}</p>`;
    }
}

async function analyzeTokenHoldings(tokens) {
    const significantTokens = [];
    for (const token of tokens) {
        if (parseFloat(token.formattedBalance) === 0) continue;
        try {
            const response = await fetch(`/proxy/tokensupply?contractAddress=${token.contractAddress}`);
            if (!response.ok) throw new Error(`Failed to fetch total supply: ${response.statusText}`);
            const { totalSupply } = await response.json();
            const percentage = (parseFloat(token.formattedBalance) / parseFloat(ethers.utils.formatUnits(totalSupply, token.metadata.decimals))) * 100;
            if (percentage >= 0.5) {
                significantTokens.push({
                    name: token.metadata.name,
                    percentage: percentage.toFixed(2)
                });
            }
        } catch (error) {
            console.error(`Error analyzing token ${token.contractAddress}:`, error);
        }
    }
    return significantTokens;
}

function analyzeNFTCollections(nfts) {
    const collections = {};
    for (const nft of nfts) {
        const collectionName = nft.contract.name || nft.contract.address;
        collections[collectionName] = (collections[collectionName] || 0) + 1;
    }
    return collections;
}

async function getTransactionCount(address) {
    const response = await fetch(`/proxy/transactioncount?address=${address}`);
    if (!response.ok) {
        throw new Error(`Failed to fetch transaction count: ${response.statusText}`);
    }
    const data = await response.json();
    return data.txCount;
}

function categorizeUser(txCount) {
    if (txCount > 10000) return 'Whale';
    if (txCount > 1000) return 'Dolphin';
    if (txCount > 100) return 'Fish';
    if (txCount > 10) return 'Shrimp';
    return 'Plankton';
}

function initCollapsibleSections() {
    const sections = document.querySelectorAll('.section');
    sections.forEach(section => {
        const header = section.querySelector('h2');
        const content = section.querySelector('.section-content');
        header.addEventListener('click', () => {
            content.style.display = content.style.display === 'none' ? 'block' : 'none';
        });
    });
}

function initExportFunctionality() {
    const exportBtn = document.getElementById('exportBtn');
    const exportModal = document.getElementById('exportModal');
    const exportOptions = document.querySelectorAll('.export-option');

    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            exportModal.style.display = 'block';
        });
    }

    exportOptions.forEach(option => {
        option.addEventListener('click', () => {
            const exportType = option.getAttribute('data-export');
            if (exportType === 'device') {
                downloadReport();
            }
            exportModal.style.display = 'none';
        });
    });

    window.addEventListener('click', (event) => {
        if (event.target === exportModal) {
            exportModal.style.display = 'none';
        }
    });
}

function downloadReport() {
    const reportData = {
        address: document.querySelector('#addressSection .section-content').innerText,
        tokenBalances: document.querySelector('#tokenSection .section-content').innerText,
        nfts: document.querySelector('#nftSection .section-content').innerText,
        analysis: document.querySelector('#analysisResults').innerText
    };
    
    const jsonString = JSON.stringify(reportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'base_identity_report.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Utility functions
function createBasescanUrl(address) {
    return `https://basescan.org/address/${address}`;
}

function createBasescanTokenUrl(contractAddress, tokenId) {
    return `https://basescan.org/token/${contractAddress}?a=${tokenId}`;
}

function truncateAddress(address) {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function truncateString(str, maxLength) {
    if (str.length <= maxLength) return str;
    return str.slice(0, maxLength - 3) + '...';
}

// Error handling functions
function showError(message) {
    const errorMessage = document.getElementById('errorMessage');
    if (errorMessage) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
    } else {
        console.error('Error message element not found');
    }
}

function clearError() {
    const errorMessage = document.getElementById('errorMessage');
    if (errorMessage) {
        errorMessage.textContent = '';
        errorMessage.style.display = 'none';
    } else {
        console.error('Error message element not found');
    }
}

// Initialize MetaMask event listeners
if (typeof window.ethereum !== 'undefined') {
    window.ethereum.on('accountsChanged', handleAccountsChanged);
    window.ethereum.on('chainChanged', () => window.location.reload());
}
