    // Removed duplicate top-level sendVouchers function; implementation remains inside the ApiClient class.
const axios = require('axios');
const logger = require('../utils/logger');

class ApiClient {
    /**
     * Send Vouchers (POST to Talenom API)
     * @param {string} organizationNumber - Organization number
     * @param {object|array} voucherData - Voucher data (single object or array)
     * @returns {Promise<object>} - API response
     */
    async sendVouchers(organizationNumber, voucherData) {
        try {
            logger.info(`Sending vouchers to Talenom for org: ${organizationNumber}`);
            if (!organizationNumber) {
                throw new Error('Organization number is required');
            }
            if (!voucherData) {
                throw new Error('Voucher data is required');
            }
            
            // If in bypass mode, simulate successful response
            if (process.env.BYPASS_AUTH === 'true') {
                logger.warn('🧪 TESTING MODE: Simulating successful voucher submission');
                logger.info(`📊 Would send ${Array.isArray(voucherData) ? voucherData.length : 1} vouchers to org: ${organizationNumber}`);
                
                // Log sample of what would be sent
                const sample = Array.isArray(voucherData) ? voucherData[0] : voucherData;
                logger.info('Sample voucher data:', JSON.stringify(sample, null, 2));
                
                return {
                    success: true,
                    message: 'Vouchers sent successfully (TEST MODE)',
                    voucherCount: Array.isArray(voucherData) ? voucherData.length : 1,
                    testMode: true
                };
            }
            
            const response = await this.httpClient.post(
                `/v2/vouchers/${encodeURIComponent(organizationNumber)}`,
                voucherData
            );
            logger.info('Vouchers sent successfully', {
                status: response.status,
                data: response.data
            });
            return response.data;
        } catch (error) {
            logger.error('Error sending vouchers to Talenom:', {
                organizationNumber,
                error: error.message,
                status: error.response?.status,
                data: error.response?.data
            });
            throw error;
        }
    }
    constructor() {
        this.baseURL = 'https://apim.talenom.com/fi/general-ledger';
        this.subscriptionKey = process.env.SUBSCRIPTION_KEY;
        this.clientId = process.env.CLIENT_ID;
        this.clientSecret = process.env.CLIENT_SECRET;
        this.tokenEndpoint = process.env.TOKEN_ENDPOINT || 'https://login.microsoftonline.com/common/oauth2/token';
        this.scope = process.env.SCOPE || 'https://apim.talenom.com/.default';
        
        this.accessToken = null;
        this.tokenExpiry = null;
        
        // Create axios instance with default config
        this.httpClient = axios.create({
            baseURL: this.baseURL,
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json',
                'Ocp-Apim-Subscription-Key': this.subscriptionKey
            }
        });
        
        // Add request interceptor for authentication
        this.httpClient.interceptors.request.use(
            async (config) => {
                await this.ensureValidToken();
                if (this.accessToken) {
                    config.headers.Authorization = `Bearer ${this.accessToken}`;
                }
                return config;
            },
            (error) => Promise.reject(error)
        );
        
        // Add response interceptor for error handling
        this.httpClient.interceptors.response.use(
            (response) => response,
            async (error) => {
                if (error.response?.status === 401) {
                    // Token might be expired, try to refresh and retry once
                    logger.warn('Received 401, attempting to refresh token');
                    this.accessToken = null;
                    this.tokenExpiry = null;
                    
                    try {
                        await this.ensureValidToken();
                        if (this.accessToken) {
                            error.config.headers.Authorization = `Bearer ${this.accessToken}`;
                            return this.httpClient.request(error.config);
                        }
                    } catch (refreshError) {
                        logger.error('Token refresh failed:', refreshError);
                    }
                }
                
                return Promise.reject(error);
            }
        );
    }
    
    /**
     * Ensure we have a valid access token
     */
    async ensureValidToken() {
        // Check if we should bypass OAuth2 for testing
        if (process.env.BYPASS_AUTH === 'true') {
            logger.warn('⚠️  OAuth2 authentication bypassed for testing');
            this.accessToken = 'test-token';
            this.tokenExpiry = Date.now() + 3600000; // 1 hour from now
            return;
        }
        
        if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
            return; // Token is still valid
        }
        
        if (!this.clientId || !this.clientSecret) {
            logger.warn('OAuth2 credentials not configured');
            return;
        }
        
        await this.getAccessToken();
    }
    
    /**
     * Get OAuth2 access token using client credentials flow
     */
    async getAccessToken() {
        try {
            logger.info('Requesting new OAuth2 token', {
                endpoint: this.tokenEndpoint,
                clientId: this.clientId,
                scope: this.scope
            });
            
            const params = new URLSearchParams();
            params.append('grant_type', 'client_credentials');
            params.append('client_id', this.clientId);
            params.append('client_secret', this.clientSecret);
            params.append('scope', this.scope);
            params.append('resource', 'https://apim.talenom.com');
            
            logger.info('OAuth2 request parameters', {
                grant_type: 'client_credentials',
                client_id: this.clientId,
                scope: this.scope,
                resource: 'https://apim.talenom.com',
                endpoint: this.tokenEndpoint
            });
            
            const response = await axios.post(this.tokenEndpoint, params, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                timeout: 10000
            });
            
            const { access_token, expires_in } = response.data;
            
            this.accessToken = access_token;
            // Set expiry with 5 minute buffer
            this.tokenExpiry = Date.now() + (expires_in - 300) * 1000;
            
            logger.info('OAuth2 token obtained successfully');
            
        } catch (error) {
            logger.error('Failed to obtain OAuth2 token:', {
                status: error.response?.status,
                statusText: error.response?.statusText,
                data: error.response?.data,
                message: error.message,
                config: {
                    url: error.config?.url,
                    method: error.config?.method,
                    headers: error.config?.headers
                }
            });
            
            // Log the full error details for debugging
            if (error.response?.data) {
                logger.error('OAuth2 Error Details:', {
                    error: error.response.data.error,
                    error_description: error.response.data.error_description,
                    error_codes: error.response.data.error_codes,
                    timestamp: error.response.data.timestamp,
                    trace_id: error.response.data.trace_id,
                    correlation_id: error.response.data.correlation_id
                });
            }
            
            throw new Error(`OAuth2 authentication failed: ${error.response?.data?.error_description || error.message}`);
        }
    }
    
    /**
     * Test multiple OAuth2 configurations to find the working one
     */
    async testOAuth2Configurations() {
        const configurations = [
            {
                name: 'Common v2.0 with scope',
                endpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
                params: {
                    grant_type: 'client_credentials',
                    client_id: this.clientId,
                    client_secret: this.clientSecret,
                    scope: this.scope
                }
            },
            {
                name: 'Common v1.0 with resource',
                endpoint: 'https://login.microsoftonline.com/common/oauth2/token',
                params: {
                    grant_type: 'client_credentials',
                    client_id: this.clientId,
                    client_secret: this.clientSecret,
                    resource: 'https://apim.talenom.com'
                }
            },
            {
                name: 'Organizations v2.0',
                endpoint: 'https://login.microsoftonline.com/organizations/oauth2/v2.0/token',
                params: {
                    grant_type: 'client_credentials',
                    client_id: this.clientId,
                    client_secret: this.clientSecret,
                    scope: this.scope
                }
            },
            {
                name: 'Talenom tenant (guessed) v2.0',
                endpoint: 'https://login.microsoftonline.com/talenom.onmicrosoft.com/oauth2/v2.0/token',
                params: {
                    grant_type: 'client_credentials',
                    client_id: this.clientId,
                    client_secret: this.clientSecret,
                    scope: this.scope
                }
            }
        ];

        for (const config of configurations) {
            try {
                logger.info(`🧪 Testing OAuth2 configuration: ${config.name}`);
                logger.info(`Endpoint: ${config.endpoint}`);
                
                const params = new URLSearchParams();
                Object.keys(config.params).forEach(key => {
                    params.append(key, config.params[key]);
                });

                const response = await axios.post(config.endpoint, params, {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    timeout: 10000
                });

                logger.info(`✅ SUCCESS with configuration: ${config.name}`);
                logger.info('Response:', {
                    status: response.status,
                    token_type: response.data.token_type,
                    expires_in: response.data.expires_in
                });

                return {
                    success: true,
                    config: config,
                    token: response.data
                };

            } catch (error) {
                logger.warn(`❌ FAILED with configuration: ${config.name}`);
                logger.warn('Error:', {
                    status: error.response?.status,
                    error: error.response?.data?.error,
                    error_description: error.response?.data?.error_description
                });
            }
        }

        logger.error('🚨 All OAuth2 configurations failed');
        return { success: false };
    }
    
    /**
     * Get General Ledger Events
     * @param {string} organizationNumber - Organization number
     * @param {object} queryParams - Query parameters
     */
    async getGeneralLedgerEvents(organizationNumber, queryParams = {}) {
        try {
            logger.info(`Fetching general ledger events for org: ${organizationNumber}`, { queryParams });
            
            // Validate required parameters
            if (!organizationNumber) {
                throw new Error('Organization number is required');
            }
            
            if (queryParams.pageIndex === undefined) {
                queryParams.pageIndex = 0;
            }
            
            if (queryParams.pageSize === undefined) {
                queryParams.pageSize = 100;
            }
            
            // Build query string
            const params = new URLSearchParams();
            Object.keys(queryParams).forEach(key => {
                if (queryParams[key] !== undefined && queryParams[key] !== null && queryParams[key] !== '') {
                    params.append(key, queryParams[key]);
                }
            });
            
            const headers = {};
            if (queryParams.language) {
                headers['Accept-Language'] = queryParams.language;
                delete queryParams.language; // Remove from URL params since it's in header
            }
            
            const response = await this.httpClient.get(
                `/v1/general-ledger-events/${encodeURIComponent(organizationNumber)}?${params.toString()}`,
                { headers }
            );
            
            logger.info('General ledger events retrieved successfully', {
                rowCount: response.data.rowCount,
                currentPage: response.data.currentPage
            });
            
            return response.data;
            
        } catch (error) {
            logger.error('Error fetching general ledger events:', {
                organizationNumber,
                queryParams,
                error: error.message,
                status: error.response?.status,
                data: error.response?.data
            });
            
            throw error;
        }
    }
    
    /**
     * Get Account Balances
     * @param {string} organizationNumber - Organization number
     * @param {object} queryParams - Query parameters
     */
    async getAccountBalances(organizationNumber, queryParams = {}) {
        try {
            logger.info(`Fetching account balances for org: ${organizationNumber}`, { queryParams });
            
            // Validate required parameters
            if (!organizationNumber) {
                throw new Error('Organization number is required');
            }
            
            if (!queryParams.date) {
                throw new Error('Date is required for account balances');
            }
            
            if (!queryParams.accountNumbers) {
                throw new Error('Account numbers are required');
            }
            
            // Build query string
            const params = new URLSearchParams();
            params.append('date', queryParams.date);
            params.append('accountNumbers', queryParams.accountNumbers);
            
            const headers = {};
            if (queryParams.language) {
                headers['Accept-Language'] = queryParams.language;
            }
            
            const response = await this.httpClient.get(
                `/v1/account-balances/${encodeURIComponent(organizationNumber)}?${params.toString()}`,
                { headers }
            );
            
            logger.info('Account balances retrieved successfully', {
                accountCount: response.data.length
            });
            
            return response.data;
            
        } catch (error) {
            logger.error('Error fetching account balances:', {
                organizationNumber,
                queryParams,
                error: error.message,
                status: error.response?.status,
                data: error.response?.data
            });
            
            throw error;
        }
    }
    
    /**
     * Get Chart of Accounts (Used Accounts)
     * @param {string} organizationNumber - Organization number
     * @param {object} queryParams - Query parameters
     */
    async getChartOfAccounts(organizationNumber, queryParams = {}) {
        try {
            logger.info(`Fetching chart of accounts for org: ${organizationNumber}`, { queryParams });
            
            // Validate required parameters
            if (!organizationNumber) {
                throw new Error('Organization number is required');
            }
            
            // Build query string
            const params = new URLSearchParams();
            if (queryParams.fromDate) {
                params.append('fromDate', queryParams.fromDate);
            }
            if (queryParams.toDate) {
                params.append('toDate', queryParams.toDate);
            }
            
            const headers = {};
            if (queryParams.language) {
                headers['Accept-Language'] = queryParams.language;
            }
            
            const response = await this.httpClient.get(
                `/v1/chart-of-accounts/used-accounts/${encodeURIComponent(organizationNumber)}?${params.toString()}`,
                { headers }
            );
            
            logger.info('Chart of accounts retrieved successfully', {
                accountCount: response.data.length
            });
            
            return response.data;
            
        } catch (error) {
            logger.error('Error fetching chart of accounts:', {
                organizationNumber,
                queryParams,
                error: error.message,
                status: error.response?.status,
                data: error.response?.data
            });
            
            throw error;
        }
    }
    
    /**
     * Get Vouchers (V2 endpoint with pagination)
     * @param {string} organizationNumber - Organization number
     * @param {object} queryParams - Query parameters
     */
    async getVouchers(organizationNumber, queryParams = {}) {
        try {
            logger.info(`Fetching vouchers for org: ${organizationNumber}`, { queryParams });
            
            // Validate required parameters
            if (!organizationNumber) {
                throw new Error('Organization number is required');
            }
            
            // Set default pagination if not provided
            if (queryParams.pageIndex === undefined) {
                queryParams.pageIndex = 0;
            }
            
            if (queryParams.pageSize === undefined) {
                queryParams.pageSize = 100;
            }
            
            // Build query string
            const params = new URLSearchParams();
            Object.keys(queryParams).forEach(key => {
                if (queryParams[key] !== undefined && queryParams[key] !== null && queryParams[key] !== '') {
                    params.append(key, queryParams[key]);
                }
            });
            
            const headers = {};
            if (queryParams.language) {
                headers['Accept-Language'] = queryParams.language;
                delete queryParams.language; // Remove from URL params since it's in header
            }
            
            const response = await this.httpClient.get(
                `/v2/vouchers/${encodeURIComponent(organizationNumber)}?${params.toString()}`,
                { headers }
            );
            
            logger.info('Vouchers retrieved successfully', {
                rowCount: response.data.rowCount,
                currentPage: response.data.currentPage
            });
            
            return response.data;
            
        } catch (error) {
            logger.error('Error fetching vouchers:', {
                organizationNumber,
                queryParams,
                error: error.message,
                status: error.response?.status,
                data: error.response?.data
            });
            
            throw error;
        }
    }
    
    /**
     * Health check method to test API connectivity
     */
    async healthCheck() {
        try {
            logger.info('Performing API health check');
            
            // Try to get a token (this will validate OAuth2 setup)
            await this.ensureValidToken();
            
            logger.info('API health check passed');
            return {
                status: 'healthy',
                authenticated: !!this.accessToken,
                baseURL: this.baseURL,
                timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            logger.error('API health check failed:', error);
            return {
                status: 'unhealthy',
                authenticated: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
}

module.exports = ApiClient;