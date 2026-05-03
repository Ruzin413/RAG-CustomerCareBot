// This utility automatically determines the backend URL.
// In development (localhost), it uses localhost.
// In production (hosting), it uses the IP address of the server it's running on.

const getBaseUrl = () => {
  // If we are on localhost, use localhost:8001
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:8001/CustomerCare';
  }
  
  // Otherwise, use the IP address of the machine serving the frontend
  return `http://${window.location.hostname}:8001/CustomerCare`;
};

export const API_BASE_URL = getBaseUrl();
