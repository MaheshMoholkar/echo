const HOST = "http://localhost:3000";

const AUTH_ROUTE = `${HOST}/api/auth`;
const USER_ROUTE = `${HOST}/api/user`;

export const CHECK_USER_ROUTE = `${AUTH_ROUTE}/check-user`;
export const LOGIN_USER_ROUTE = `${AUTH_ROUTE}/login-user`;
export const REGISTER_USER_ROUTE = `${AUTH_ROUTE}/register-user`;
export const GET_USERS_ROUTE = `${USER_ROUTE}/get-users`;
