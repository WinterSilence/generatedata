import { Dispatch } from 'redux';
import { gql } from '@apollo/client';
import { AuthMethod, GDAction, GDLocale } from '~types/general';
import * as langUtils from '~utils/langUtils';
import { apolloClient } from '../../apolloClient';
import { getAuthMethod, getCurrentPage } from '~store/main/main.selectors';
import { logoutVendor, setAuthTokenRefresh } from '~utils/authUtils';
import { AccountType } from '~types/account';
import store from '~core/store';
import { showSaveDataSetDialog } from '~store/account/account.actions';
import { addToast, setTourComponents } from '~utils/generalUtils';
import { getStrings } from '~utils/langUtils';
import { updateBodyClass, getGeneratorRoute } from '~utils/routeUtils';
import { CLEAR_GRID } from '~store/generator/generator.actions';

export const LOCALE_FILE_LOADED = 'LOCALE_FILE_LOADED';
export const setLocaleFileLoaded = (locale: GDLocale): GDAction => ({
	type: LOCALE_FILE_LOADED,
	payload: {
		locale
	}
});

export const selectLocale = (locale: GDLocale): any => (dispatch: Dispatch): any => {
	window.gd = {};
	window.gd.localeLoaded = (strings: any): void => {
		langUtils.setLocale(locale, strings);
		dispatch(setLocaleFileLoaded(locale));
	};
	const s = document.createElement('script');
	s.src = `./${locale}.js`;
	document.body.appendChild(s);
};

export const RESET_STORE = 'RESET_STORE';
export const resetStore = (): GDAction => ({ type: RESET_STORE });

export const PAGE_CHANGE = 'PAGE_CHANGE';
export const initRouteListener = (history: any): void => {
	updateBodyClass(store, history.location.pathname);

	history.listen((location: any) => {
		updateBodyClass(store, location.pathname);
	});
};

export const SET_LOGIN_DIALOG_VISIBILITY = 'SET_LOGIN_DIALOG_VISIBILITY';
export const setLoginDialogVisibility = (visible: boolean): GDAction => ({
	type: SET_LOGIN_DIALOG_VISIBILITY,
	payload: {
		visible
	}
});

export const SET_AUTHENTICATION_DATA = 'SET_AUTHENTICATION_DATA';

export type AuthData = {
	authMethod?: AuthMethod;
	token: string;
	firstName: string;
	lastName: string;
	email: string;
	country: string;
	region: string;
	profileImage: string;
	dateExpires: string;
	dateCreated: string;
	accountType: AccountType;
	numRowsGenerated: number;
};

export const setAuthenticationData = (authData: AuthData): GDAction => ({
	type: SET_AUTHENTICATION_DATA,
	payload: authData
});

export const AUTHENTICATED = 'AUTHENTICATED';
export const setAuthenticated = (authenticated = true): GDAction => ({
	type: AUTHENTICATED,
	payload: {
		authenticated
	}
});

export const START_LOGIN = 'START_LOGIN';
export const startLogin = (): GDAction => ({ type: START_LOGIN });


// hacky, but if we need something like this elsewhere I can revisit. This is used by the Login button in Save dialog.
// When the user clicks that, we want to return them to the Save dialog after authentication. The register process is more
// complicated so I think returning them to the save dialog after all that might be a bit much. They can always just
// re-click the Save button at that step (nothing would have been lost, unlike with v3)
let loginFlow = '';
export const setReturnToSaveDataSet = (): void => {
	loginFlow = 'fromSaveDataSet';
};
export const clearLoginFlow = (): any => {
	loginFlow = '';
};

// default authentication
export const login = (email: string, password: string, onLoginError: Function): any => async (dispatch: Dispatch): Promise<any> => {
	dispatch(startLogin());

	const response = await apolloClient.mutate({
		mutation: gql`
            mutation LoginMutation($email: String!, $password: String!) {
                login(email: $email, password: $password) {
                    token
                    tokenExpiry
                    success
                    firstName
                    lastName
                    email
                    country
                    region
                    dateExpires
                    accountType
                    dateCreated
                    numRowsGenerated
                    profileImage
                }
            }
		`,
		variables: { email, password }
	});

	if (response.data.login.success) {
		dispatch(setAuthenticationData({
			...response.data.login,
			authMethod: 'default'
		}));
		onLoginSuccess(response.data.login.tokenExpiry, false, dispatch);
	} else {
		onLoginError();
	}
};

export const onLoginSuccess = (tokenExpiry: number | null, onPageRender: boolean, dispatch: Dispatch): void => {
	const i18n = getStrings();

	if (tokenExpiry) {
		setAuthTokenRefresh(tokenExpiry, (): any => refreshToken()(dispatch));
	}

	dispatch(setLoginDialogVisibility(false));

	if (!onPageRender) {
		addToast({
			type: 'success',
			message: i18n.core.nowLoggedIn
		});

		if (loginFlow === 'fromSaveDataSet') {
			dispatch(showSaveDataSetDialog());
			loginFlow = '';
		}
	}
};

export const LOGOUT = 'LOGOUT';
export const logout = (): any => async (dispatch: Dispatch, getState: any): Promise<any> => {
	const i18n = getStrings();

	// if the user logged in with Google, Facebook etc. we need to also let them know
	logoutVendor(getAuthMethod(getState()));

	dispatch({ type: LOGOUT });
	dispatch({ type: CLEAR_GRID });

	addToast({
		type: 'success',
		message: i18n.core.nowLoggedOut
	});

	// doesn't awfully matter if this fails. It's just for cleanup
	await apolloClient.mutate({
		mutation: gql`
            mutation Logout {
                logout {
                    success
                }
            }
		`
	});
};

export const SET_AUTH_TOKEN = 'SET_AUTH_TOKEN';
export const setAuthToken = (token: string): GDAction => ({ type: SET_AUTH_TOKEN, payload: { token } });

export const REFRESHING_TOKEN = 'REFRESHING_TOKEN';
export const refreshToken = () => async (dispatch: Dispatch): Promise<any> => {
	dispatch({ type: REFRESHING_TOKEN });

	const response = await apolloClient.mutate({
		mutation: gql`
            mutation RefreshToken {
                refreshToken {
                    token
                    tokenExpiry
                    success
                    firstName
                    lastName
                    email
                    country
                    region
                    dateExpires
                    accountType
                    dateCreated
                    numRowsGenerated
                    profileImage
                }
            }
		`
	});

	const success = response.data.refreshToken.success;
	if (success) {
		const { token, tokenExpiry } = response.data.refreshToken;
		setAuthTokenRefresh(tokenExpiry, (): any => refreshToken()(dispatch));
		dispatch(setAuthenticationData(response.data.refreshToken));
		dispatch(setAuthToken(token));
	} else {
		console.log('token NOT refreshed', response);
	}

	dispatch(setAuthenticated(success));

	console.log('onload auth determined');
	dispatch(setOnloadAuthDetermined());
};

export const ONLOAD_AUTH_DETERMINED = 'ONLOAD_AUTH_DETERMINED';
export const setOnloadAuthDetermined = (): GDAction => ({ type: ONLOAD_AUTH_DETERMINED });

export const SHOW_TOUR_INTRO_DIALOG = 'SHOW_TOUR_INTRO_DIALOG';
export const showTourIntroDialog = (history?: any) => (dispatch: Dispatch, getState: any): any => {
	// the tour is specific to the generator page, so always redirect there when showing/hiding it
	if (history && getCurrentPage(getState()) !== getGeneratorRoute()) {
		history.push(getGeneratorRoute());
	}

	dispatch({ type: SHOW_TOUR_INTRO_DIALOG });
};

export const HIDE_TOUR_INTRO_DIALOG = 'HIDE_TOUR_INTRO_DIALOG';
export const hideTourIntroDialog = (): GDAction => ({ type: HIDE_TOUR_INTRO_DIALOG });

export const TOUR_BUNDLE_LOADED = 'TOUR_BUNDLE_LOADED';
export const loadTourBundle = (): any => (dispatch: Dispatch): void => {
	// TODO check hashing of bundle here
	import(
		/* webpackChunkName: "tour" */
		/* webpackMode: "lazy" */
		`../../../tours`
	)
		.then((resp) => {
			setTourComponents(resp.default);
			dispatch({ type: TOUR_BUNDLE_LOADED });
		})
		.catch(() => {
			dispatch(hideTourIntroDialog());

			addToast({
				type: 'success',
				message: 'Sorry, there was a problem loading the tour.'
			});
		});
};
