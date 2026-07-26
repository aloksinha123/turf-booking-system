export const fetchApi = async (url, options = {}) => {
  // Merge default options
  const defaultOptions = {
    credentials: 'include', // Automatically send secure HttpOnly cookies
  };

  // If the user hasn't explicitly set Content-Type to null/something else, default to JSON
  if (options.body && !(options.body instanceof FormData)) {
    if (!options.headers) options.headers = {};
    if (!options.headers['Content-Type']) {
      options.headers['Content-Type'] = 'application/json';
    }
  }

  // We can safely remove Authorization headers in the frontend now
  // since the cookie handles it! We'll just filter it out if passed.
  if (options.headers && options.headers['Authorization']) {
    delete options.headers['Authorization'];
  }

  const finalOptions = {
    ...defaultOptions,
    ...options,
    headers: {
      ...options.headers,
    }
  };

  const response = await fetch(url, finalOptions);
  return response;
};
