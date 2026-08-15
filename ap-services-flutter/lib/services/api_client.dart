import 'package:dio/dio.dart';
import '../config/app_config.dart';

typedef TokenProvider = Future<String?> Function();

class ApiClient {
  ApiClient({TokenProvider? tokenProvider})
      : _tokenProvider = tokenProvider,
        _dio = Dio(
          BaseOptions(
            baseUrl: AppConfig.apiBaseUrl,
            connectTimeout: const Duration(seconds: 20),
            receiveTimeout: const Duration(seconds: 20),
            headers: {'Accept': 'application/json'},
          ),
        ) {
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          if (AppConfig.readOnlyMode && _blocksWrite(options)) {
            return handler.reject(
              DioException(
                requestOptions: options,
                message: 'Read-only test mode — live database cannot be modified',
                type: DioExceptionType.cancel,
              ),
            );
          }
          final token = await _tokenProvider?.call();
          if (token != null && token.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          handler.next(options);
        },
      ),
    );
  }

  static bool _blocksWrite(RequestOptions options) {
    final method = options.method.toUpperCase();
    if (method == 'GET' || method == 'HEAD' || method == 'OPTIONS') {
      return false;
    }
    final path = options.uri.path.toLowerCase();
    const allowedWrites = [
      '/auth/login',
      '/auth/refresh',
      '/auth/exchange-code',
      '/auth/logout',
    ];
    for (final allowed in allowedWrites) {
      if (path.endsWith(allowed) || path.contains('$allowed')) return false;
    }
    return true;
  }

  final Dio _dio;
  final TokenProvider? _tokenProvider;

  Dio get dio => _dio;

  Future<Map<String, dynamic>> getJson(
    String path, {
    Map<String, dynamic>? query,
    bool auth = true,
  }) async {
    final response = await _dio.get<Map<String, dynamic>>(
      path,
      queryParameters: query,
      options: Options(extra: {'auth': auth}),
    );
    return response.data ?? {};
  }

  Future<Map<String, dynamic>> postJson(
    String path, {
    Map<String, dynamic>? body,
    bool auth = true,
  }) async {
    final response = await _dio.post<Map<String, dynamic>>(
      path,
      data: body,
      options: Options(extra: {'auth': auth}),
    );
    return response.data ?? {};
  }

  List<Map<String, dynamic>> extractList(Map<String, dynamic> response) {
    if (response['data'] is List) {
      return (response['data'] as List).cast<Map<String, dynamic>>();
    }
    if (response['data'] is Map) {
      final inner = response['data'] as Map<String, dynamic>;
      for (final key in ['data', 'items', 'rows', 'rooms', 'conversations']) {
        if (inner[key] is List) {
          return (inner[key] as List).cast<Map<String, dynamic>>();
        }
      }
    }
    for (final key in ['rooms', 'items', 'rows']) {
      if (response[key] is List) {
        return (response[key] as List).cast<Map<String, dynamic>>();
      }
    }
    return [];
  }

  T unwrapData<T>(Map<String, dynamic> response, T Function(Map<String, dynamic>) parser) {
    final data = response['data'];
    if (data is Map<String, dynamic>) return parser(data);
    return parser(response);
  }
}
