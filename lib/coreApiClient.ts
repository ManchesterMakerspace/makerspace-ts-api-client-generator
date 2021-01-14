export interface ApiError {
  status: number;
  message: string;
  error: string;
}
export interface ApiErrorResponse {
  error: ApiError;
  response: Response;
}

export interface ApiDataResponse<T> {
  response: Response;
  data: T;
  error?: ApiError;
}

const isObject = (item: any): boolean => !!item && typeof item === 'object';
export const isApiErrorResponse = (response: any): response is ApiErrorResponse => {
  return !!(isObject(response) && response.error);
}

const defaultMessage = "Unknown Error.  Contact an administrator";
let baseUrl: string = process.env.BASE_URL || "";
let baseApiPath: string = "/api";
export const setBaseApiPath = (path: string) => baseApiPath = path;

const buildUrl = (path: string): string => `${baseUrl}${baseApiPath}${path}`;
const parseQueryParams = (params: { [key: string]: any }) =>
  Object.keys(params)
    .filter(k => params[k] !== undefined)
    .map(k => {

      let key = encodeURIComponent(k);
      const value = params[k];
      if (Array.isArray(value)) {
        key += "[]";
        return value.map(v => constructQueryParam(key, v)).join("&");
      }

      return constructQueryParam(key, value);
    })
    .join('&');

const constructQueryParam = (key: string, value: string): string =>
  `${key}=${encodeURIComponent(value)}`;

export const makeRequest = <T>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  params?: { [key: string]: any },
): Promise<ApiDataResponse<T>> => {
  let body: string;
  let url: string = buildUrl(path);
  if (params) {
    if (["GET", "DELETE"].includes(method)) {
      url += `?${parseQueryParams(params)}`;
    } else {
      body = JSON.stringify(params);
    }
  }

  return window.fetch(url, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-XSRF-TOKEN': getCookie('XSRF-TOKEN'),
    },
    method,
    body
  })
  .then(async (response: Response) => {
    const result: ApiDataResponse<T> = {
      response: response.clone(),
      data: undefined
    }

    try {
      result.data = await result.response.json()
    } catch { }

    if (result.response.status >= 200 && result.response.status < 300) {
      return result;
    } else {
      return {
        response: result.response,
        data: undefined,
        error: (result.data as unknown as ApiError)|| {
          status: 500,
          message: defaultMessage,
          error: "internal_server_error"
        }
      };
    }
  });
};

const getCookie = (name: string): string => {
  if (!document.cookie) {
    return null;
  }
  const xsrfCookies = document.cookie.split(';')
    .map(c => c.trim())
    .filter(c => c.startsWith(name + '='));

  if (xsrfCookies.length === 0) {
    return null;
  }
  return decodeURIComponent(xsrfCookies[0].split('=')[1]);
};
