import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

/// The backend's address: `--dart-define=API_URL=https://...`. Debug builds default to dev.py on this PC (from an
/// emulator); release builds have no default, so a build without the real address fails at start instead of shipping.
const apiUrl = String.fromEnvironment('API_URL', defaultValue: bool.fromEnvironment('dart.vm.product') ? '' : 'http://10.0.2.2:8000');

/// A refused request, with the backend's message people can read.
class ApiError implements Exception {
  ApiError(this.status, this.message);
  final int status;
  final String message;

  @override
  String toString() => message;
}

/// Thin client of the REST API (apps/backend/api.py): all rules live in the backend. Every call carries a fresh Clerk
/// session token, so the app acts for the signed-in account exactly like the website does.
class Api {
  Api(this.token, {http.Client? client, this.base = apiUrl}) : _http = client ?? http.Client();
  final Future<String> Function() token;
  final String base;
  final http.Client _http;

  Future<dynamic> call(String method, String path, [Object? body]) async {
    final request = http.Request(method, Uri.parse('$base/api$path'))
      ..headers['Authorization'] = 'Bearer ${await token()}';
    if (body != null) {
      request.headers['Content-Type'] = 'application/json';
      request.body = jsonEncode(body);
    }
    final http.Response response;
    try {
      response = await http.Response.fromStream(await _http.send(request).timeout(const Duration(seconds: 30)));
    } on TimeoutException {
      throw ApiError(0, 'YT-Clipper is taking too long to answer. Try again.');
    } on IOException {
      throw ApiError(0, "Can't reach YT-Clipper. Check your connection and try again.");
    } on http.ClientException {
      throw ApiError(0, "Can't reach YT-Clipper. Check your connection and try again.");
    }
    if (response.statusCode >= 400) throw ApiError(response.statusCode, errorMessage(response));
    return response.body.isEmpty ? null : jsonDecode(utf8.decode(response.bodyBytes));
  }

  /// Sends a video from the phone straight to storage and answers the project source (`upload:<id>`).
  Future<String> upload(File file, String contentType, void Function(double done) progress) async {
    final size = await file.length();
    final ticket = await call('POST', '/uploads', {'content_type': contentType, 'size': size});
    final put = http.StreamedRequest('PUT', Uri.parse(ticket['upload_url']))
      ..contentLength = size
      ..headers.addAll(Map<String, String>.from(ticket['headers']));
    final response = _http.send(put);
    var sent = 0;
    await file.openRead().map((chunk) {
      progress((sent += chunk.length) / size);
      return chunk;
    }).pipe(put.sink);
    if ((await response).statusCode >= 300) throw ApiError(502, "The upload didn't go through. Try again.");
    return ticket['source'];
  }

  /// Saves a file to [to]: an API path (with the session token) or a signed storage link (the link is the permission).
  Future<File> download(String path, File to, {bool signedIn = false}) async {
    final request = http.Request('GET', Uri.parse(path.startsWith('http') ? path : '$base/api$path'));
    if (signedIn) request.headers['Authorization'] = 'Bearer ${await token()}';
    final response = await _http.send(request);
    if (response.statusCode >= 400) throw ApiError(response.statusCode, "That file didn't download. Try again.");
    await response.stream.pipe(to.openWrite());
    return to;
  }
}

/// FastAPI answers {"detail": "text"}, or {"detail": [{"msg": ...}]} when a field is invalid.
String errorMessage(http.Response response) {
  try {
    final detail = jsonDecode(response.body)['detail'];
    if (detail is String) return detail;
    if (detail is List && detail.isNotEmpty) return '${detail.first['msg']}'.replaceFirst('Value error, ', '');
  } catch (_) {}
  return 'Something went wrong (${response.statusCode}). Try again.';
}

const running = ['queued', 'downloading', 'transcribing', 'analyzing', 'rendering', 'packaging'];

String sourceLabel(String source, [String? title]) {
  if (title != null && title.isNotEmpty) return title;
  if (source.startsWith('upload:')) return 'Uploaded video';
  final url = Uri.parse(source);
  return url.host.replaceFirst('www.', '') + url.path.replaceFirst(RegExp(r'/$'), '') + (url.hasQuery ? '?${url.query}' : '');
}

/// A short name for a small card: the video's own title, the site it came from, or that it was uploaded.
String sourceName(String source, [String? title]) {
  if (title != null && title.isNotEmpty) return title;
  return source.startsWith('upload:') ? 'Uploaded video' : Uri.parse(source).host.replaceFirst('www.', '');
}

String plural(num n, String word) {
  final count = n is int || n == n.roundToDouble() ? n.round().toString() : '$n';
  return '$count $word${n == 1 ? '' : 's'}';
}

/// What a picked video is, for the signed upload link (image_picker often has no mime type on Android).
String videoType(String path, String? mimeType) =>
    mimeType ?? (path.toLowerCase().endsWith('.mov') ? 'video/quicktime' : 'video/mp4');

/// Something shared to the app from another app (a link from YouTube, a video from the gallery).
typedef Shared = ({String? link, File? video});

/// The first http(s) link in shared text ("Watch this! https://youtu.be/abc?si=x" -> the link), or null.
String? sharedLink(String text) => RegExp(r'https?://\S+').firstMatch(text)?[0];

/// The project options as the API takes them; throws a readable error for values the backend would refuse.
Map<String, Object?> projectSettings(String clips, String shortest, String longest,
    {bool captions = true, String orientation = '9:16'}) {
  final count = clips.trim().isEmpty ? null : int.tryParse(clips.trim());
  final (min, max) = (num.tryParse(shortest.trim()), num.tryParse(longest.trim()));
  if (clips.trim().isNotEmpty && (count == null || count < 1 || count > 30)) throw ApiError(422, 'Clips must be a number from 1 to 30.');
  if (min == null || max == null || min < 5 || max > 180) throw ApiError(422, 'Clip lengths must be between 5 and 180 seconds.');
  if (min > max) throw ApiError(422, 'The shortest clip must not be longer than the longest.');
  return {'clips': count, 'min_seconds': min, 'max_seconds': max, 'captions': captions, 'orientation': orientation};
}

const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/// A date in the phone's time zone: 16 Sep 2026.
String day(String iso) {
  final t = DateTime.parse(iso).toLocal();
  return '${t.day} ${_months[t.month - 1]} ${t.year}';
}

/// A date and time: Mon 16 Sep, 08:00.
String when(String iso) {
  final t = DateTime.parse(iso).toLocal();
  return '${weekdays[t.weekday - 1]} ${t.day} ${_months[t.month - 1]}, ${clockOf(t)}';
}

/// The day and month only: Mon 16 Sep.
String dayLabel(String iso) {
  final t = DateTime.parse(iso).toLocal();
  return '${weekdays[t.weekday - 1]} ${t.day} ${_months[t.month - 1]}';
}

String clockOf(DateTime t) => '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

/// The time of day of an instant: 08:00.
String timeLabel(String iso) => clockOf(DateTime.parse(iso).toLocal());

/// Where a clip sits in its video: 12:05.
String clock(num seconds) => '${seconds ~/ 60}:${(seconds % 60).floor().toString().padLeft(2, '0')}';

/// Video time for a plan's allowance, as the website says it.
String hours(num minutes) =>
    minutes < 60 ? plural(minutes.round(), 'minute') : plural((minutes / 6).round() / 10, 'hour');

/// A price: $15.00.
String money(int cents) => '\$${(cents / 100).toStringAsFixed(2)}';
