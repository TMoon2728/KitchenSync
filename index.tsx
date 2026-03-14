
import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import './index.css';

import { Auth0Provider, AppState } from '@auth0/auth0-react';
import { useNavigate } from 'react-router-dom';

const Auth0ProviderWithRedirectCallback = ({ children, ...props }: any) => {
  const navigate = useNavigate();

  const onRedirectCallback = (appState?: AppState) => {
    // If we're using HashRouter, we must preserve the hash, otherwise fallback to standard path + search
    const defaultRoute = window.location.hash 
      ? window.location.hash.replace(/^#/, '') 
      : window.location.pathname + window.location.search;
      
    navigate((appState && appState.returnTo) || defaultRoute);
  };

  return (
    <Auth0Provider onRedirectCallback={onRedirectCallback} {...props}>
      {children}
    </Auth0Provider>
  );
};

const domain = import.meta.env.VITE_AUTH0_DOMAIN;
const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;
const audience = import.meta.env.VITE_AUTH0_AUDIENCE;

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <HashRouter>
      <Auth0ProviderWithRedirectCallback
        domain={domain}
        clientId={clientId}
        authorizationParams={{
          redirect_uri: window.location.origin.replace(/\/$/, ''),
          audience: audience,
          scope: "openid profile email"
        }}
        cacheLocation="localstorage"
        useRefreshTokens={true}
      >
        <App />
      </Auth0ProviderWithRedirectCallback>
    </HashRouter>
  </React.StrictMode>
);
