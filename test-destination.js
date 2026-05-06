const axios = require('axios');

async function testDestinationService() {
  try {
    console.log('Testing Destination Service authentication...');

    let tokenUrl = process.env.BTP_DESTINATION_TOKEN_URL;
    if (!tokenUrl.includes('/oauth/token')) {
      tokenUrl = tokenUrl + '/oauth/token';
    }

    console.log('Token URL:', tokenUrl);

    const clientId = process.env.BTP_DESTINATION_CLIENT_ID;
    const clientSecret = process.env.BTP_DESTINATION_CLIENT_SECRET;
    const destServiceUrl = process.env.BTP_DESTINATION_SERVICE_URL;
    const destName = process.env.BTP_DESTINATION_NAME;

    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);

    const tokenResponse = await axios.post(tokenUrl, params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    console.log('✅ OAuth token obtained successfully');
    console.log('Token type:', tokenResponse.data.token_type);
    console.log('Expires in:', tokenResponse.data.expires_in, 'seconds');

    const accessToken = tokenResponse.data.access_token;

    // Now try to get the destination
    console.log('\nFetching destination:', destName);
    const destUrl = `${destServiceUrl}/destination-configuration/v1/destinations/${destName}`;
    console.log('Destination URL:', destUrl);

    const destResponse = await axios.get(destUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    console.log('✅ Destination retrieved successfully');
    console.log('Destination URL:', destResponse.data.destinationConfiguration.URL);
    console.log('Authentication Type:', destResponse.data.destinationConfiguration.Authentication);
    console.log('Proxy Type:', destResponse.data.destinationConfiguration.ProxyType);

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Status Text:', error.response.statusText);
    }
    throw error;
  }
}

testDestinationService().catch(console.error);
