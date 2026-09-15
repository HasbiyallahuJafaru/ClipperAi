import 'package:flutter/material.dart';

import 'api.dart';
import 'main.dart';
import 'screens.dart';

/// Buffer's network names (publishing.py SERVICES), for people.
const networks = {
  'tiktok': 'TikTok', 'instagram': 'Instagram', 'youtube': 'YouTube', 'linkedin': 'LinkedIn', 'facebook': 'Facebook',
  'twitter': 'X',
};

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

String network(String service) => networks[service] ?? service;

String when(String iso) {
  final t = DateTime.parse(iso).toLocal();
  return '${weekdays[t.weekday - 1]} ${t.day}/${t.month} ${time(TimeOfDay.fromDateTime(t))}';
}

String time(TimeOfDay t) => '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

/// A post's state in words, like the website's PostList.
String postState(Map post) => switch (post['status']) {
      'queued' => 'Scheduling...',
      'sending' => 'Posting...',
      'scheduled' => post['due_at'] == null ? 'Scheduled' : 'Scheduled for ${when(post['due_at'])}',
      'sent' => post['sent_at'] == null ? 'Posted' : 'Posted ${when(post['sent_at'])}',
      'error' => "Didn't post: ${post['error'] ?? "Buffer didn't say why."}",
      _ => 'Waiting for approval in Buffer',
    };

Future<T?> sheet<T>(BuildContext context, Widget child) => showModalBottomSheet<T>(
      context: context, isScrollControlled: true, backgroundColor: surface, useSafeArea: true,
      builder: (_) => Padding(padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom), child: child),
    );

/// Edit a clip's copy: title, description, hashtags and each platform's post. Pops true once saved.
class ClipEditor extends StatefulWidget {
  const ClipEditor({super.key, required this.api, required this.projectId, required this.clip});
  final Api api;
  final String projectId;
  final Map clip;

  @override
  State<ClipEditor> createState() => _ClipEditorState();
}

class _ClipEditorState extends State<ClipEditor> {
  late final title = TextEditingController(text: widget.clip['title']);
  late final hook = TextEditingController(text: widget.clip['hook'] ?? '');
  late final description = TextEditingController(text: widget.clip['description'] ?? '');
  late final hashtags = TextEditingController(text: (widget.clip['hashtags'] as List? ?? []).join(' '));
  late final posts = {for (final key in platforms.keys) key: TextEditingController(text: widget.clip['posts']?[key] ?? '')};
  bool saving = false;
  String? problem;

  Future<void> save() async {
    setState(() { saving = true; problem = null; });
    try {
      await widget.api.call('PATCH', '/projects/${widget.projectId}/clips/${widget.clip['idx']}', {
        'title': title.text.trim(),
        'hook': hook.text.trim(),
        'description': description.text.trim(),
        'hashtags': hashtags.text.split(RegExp(r'\s+')).where((tag) => tag.isNotEmpty).toList(),
        'posts': {for (final MapEntry(:key, :value) in posts.entries) key: value.text.trim()},
      });
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) setState(() { saving = false; problem = '$e'; });
    }
  }

  @override
  Widget build(BuildContext context) => ListView(shrinkWrap: true, padding: const EdgeInsets.fromLTRB(16, 24, 16, 24), children: [
        const Heading(before: 'Edit ', accent: 'clip', size: 24),
        const SizedBox(height: 16),
        TextField(controller: title, maxLength: 300, decoration: const InputDecoration(labelText: 'Title')),
        const SizedBox(height: 8),
        TextField(controller: hook, maxLength: 300, decoration: const InputDecoration(labelText: 'Hook', helperText: 'An opening line for your post or voiceover')),
        const SizedBox(height: 8),
        TextField(controller: description, maxLines: 3, maxLength: 5000, decoration: const InputDecoration(labelText: 'Description')),
        const SizedBox(height: 8),
        TextField(controller: hashtags, decoration: const InputDecoration(labelText: 'Hashtags', helperText: 'Separate them with spaces')),
        for (final MapEntry(:key, :value) in platforms.entries) ...[
          const SizedBox(height: 16),
          TextField(controller: posts[key], maxLines: 4, minLines: 2, decoration: InputDecoration(labelText: '$value post')),
        ],
        if (problem != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(problem!, style: const TextStyle(color: danger))),
        const SizedBox(height: 16),
        FilledButton(onPressed: saving ? null : save, child: Text(saving ? 'Saving...' : 'Save changes')),
      ]);
}

/// The connected social accounts to post to, as checkboxes. Unusable ones are shown greyed out with the reason.
class ChannelPicker extends StatelessWidget {
  const ChannelPicker({super.key, required this.channels, required this.chosen, required this.onChanged});
  final List channels;
  final Set<String> chosen;
  final ValueChanged<Set<String>> onChanged;

  @override
  Widget build(BuildContext context) {
    if (channels.isEmpty) {
      return const Text('No social accounts are connected in Buffer yet. Connect them in Buffer, then come back.', style: TextStyle(color: muted));
    }
    return Column(children: [
      for (final channel in channels)
        CheckboxListTile(
          contentPadding: EdgeInsets.zero,
          value: chosen.contains(channel['id']),
          onChanged: channel['usable'] == true
              ? (on) => onChanged(on! ? {...chosen, channel['id']} : ({...chosen}..remove(channel['id'])))
              : null,
          title: Text(channel['displayName'] ?? channel['name'], style: const TextStyle(fontWeight: FontWeight.w500)),
          subtitle: Text(channel['usable'] == true ? network(channel['service'])
              : channel['isDisconnected'] == true ? '${network(channel['service'])}: reconnect it in Buffer'
              : '${network(channel['service'])}: can\'t take clips'),
        ),
    ]);
  }
}

/// Post one approved clip now or at a chosen time. Pops true once it's sent to Buffer.
class PublishSheet extends StatefulWidget {
  const PublishSheet({super.key, required this.api, required this.projectId, required this.clip});
  final Api api;
  final String projectId;
  final Map clip;

  @override
  State<PublishSheet> createState() => _PublishSheetState();
}

class _PublishSheetState extends State<PublishSheet> {
  List? channels;
  Set<String> chosen = {};
  DateTime? at; // null = post now
  bool sending = false;
  String? problem;

  @override
  void initState() {
    super.initState();
    widget.api.call('GET', '/publishing/channels').then(
      (list) => mounted ? setState(() => channels = list) : null,
      onError: (e) => mounted ? setState(() => problem = '$e') : null,
    );
  }

  Future<void> pickTime() async {
    final now = DateTime.now();
    final day = await showDatePicker(context: context, firstDate: now, lastDate: now.add(const Duration(days: 30)), initialDate: at ?? now);
    if (day == null || !mounted) return;
    final clock = await showTimePicker(context: context, initialTime: TimeOfDay.fromDateTime(at ?? now.add(const Duration(hours: 1))));
    if (clock != null) setState(() => at = DateTime(day.year, day.month, day.day, clock.hour, clock.minute));
  }

  Future<void> send() async {
    setState(() { sending = true; problem = null; });
    try {
      await widget.api.call('POST', '/projects/${widget.projectId}/clips/${widget.clip['idx']}/publish', {
        'channels': chosen.toList(),
        if (at != null) 'due_at': at!.toUtc().toIso8601String(),
      });
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) setState(() { sending = false; problem = '$e'; });
    }
  }

  @override
  Widget build(BuildContext context) => ListView(shrinkWrap: true, padding: const EdgeInsets.fromLTRB(16, 24, 16, 24), children: [
        const Heading(before: 'Publish ', accent: 'this clip', size: 24),
        const SizedBox(height: 4),
        Text(widget.clip['title'], style: const TextStyle(color: muted)),
        const SizedBox(height: 16),
        if (channels == null && problem == null) const Center(child: CircularProgressIndicator()),
        if (channels != null) ChannelPicker(channels: channels!, chosen: chosen, onChanged: (next) => setState(() => chosen = next)),
        const SizedBox(height: 12),
        SegmentedButton<bool>(
          segments: const [ButtonSegment(value: false, label: Text('Post now')), ButtonSegment(value: true, label: Text('Schedule'))],
          selected: {at != null},
          onSelectionChanged: (later) => later.first ? pickTime() : setState(() => at = null),
        ),
        if (at != null) ...[
          const SizedBox(height: 8),
          OutlinedButton.icon(onPressed: pickTime, icon: const Icon(Icons.schedule_rounded, size: 18), label: Text(when(at!.toUtc().toIso8601String()))),
        ],
        if (problem != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(problem!, style: const TextStyle(color: danger))),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: sending || chosen.isEmpty ? null : send,
          child: Text(sending ? (at == null ? 'Posting...' : 'Scheduling...') : (at == null ? 'Post now' : 'Schedule')),
        ),
      ]);
}

/// The project's content calendar: every post with its state, and a form that spreads approved clips over days and times.
class CalendarPage extends StatefulWidget {
  const CalendarPage({super.key, required this.api, required this.projectId, this.timezone});
  final Api api;
  final String projectId;
  final Future<String> Function()? timezone; // the phone's time zone name, e.g. Africa/Lagos

  @override
  State<CalendarPage> createState() => _CalendarPageState();
}

class _CalendarPageState extends State<CalendarPage> with Polling {
  @override
  Future fetch() => widget.api.call('GET', '/projects/${widget.projectId}/publications');

  @override
  bool busy(data) => (data['publications'] as List).any((p) => ['queued', 'sending'].contains(p['status']));

  Future<void> remove(Map post) async {
    try {
      await widget.api.call('DELETE', '/publications/${post['id']}');
    } catch (e) {
      if (mounted) toast(context, e);
    }
    load();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Calendar')),
        body: loaded((data) {
          final posts = [...data['publications']]..sort((a, b) => '${a['due_at'] ?? a['created_at']}'.compareTo('${b['due_at'] ?? b['created_at']}'));
          return RefreshIndicator(onRefresh: load, child: ListView(padding: const EdgeInsets.fromLTRB(16, 0, 16, 32), children: [
            ScheduleForm(api: widget.api, projectId: widget.projectId, timezone: widget.timezone, onScheduled: load),
            const SizedBox(height: 20),
            Card(child: Padding(padding: const EdgeInsets.fromLTRB(16, 16, 8, 8), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(posts.isEmpty ? 'Nothing scheduled yet' : plural(posts.length, 'post'),
                  style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600, letterSpacing: -0.4)),
              for (final post in posts)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text('Clip ${post['clip_idx']} on ${network(post['service'])}', style: const TextStyle(fontWeight: FontWeight.w500)),
                  subtitle: Text('${post['channel_name']} · ${postState(post)}',
                      style: TextStyle(color: post['status'] == 'error' ? danger : muted)),
                  trailing: ['sent', 'sending'].contains(post['status'])
                      ? null
                      : IconButton(tooltip: 'Unschedule', icon: const Icon(Icons.close_rounded), onPressed: () => remove(post)),
                ),
            ]))),
          ]));
        }),
      );
}

class ScheduleForm extends StatefulWidget {
  const ScheduleForm({super.key, required this.api, required this.projectId, required this.onScheduled, this.timezone});
  final Api api;
  final String projectId;
  final VoidCallback onScheduled;
  final Future<String> Function()? timezone;

  @override
  State<ScheduleForm> createState() => _ScheduleFormState();
}

class _ScheduleFormState extends State<ScheduleForm> {
  List? channels;
  Set<String> chosen = {};
  Set<int> days = {1, 3, 5};
  List<TimeOfDay> times = [const TimeOfDay(hour: 9, minute: 0)];
  DateTime start = DateTime.now().add(const Duration(days: 1));
  Map? plan; // the preview, with the request it was made from
  bool working = false;
  String? problem;

  @override
  void initState() {
    super.initState();
    widget.api.call('GET', '/publishing/channels').then(
      (list) => mounted ? setState(() => channels = list) : null,
      onError: (e) => mounted ? setState(() => problem = '$e') : null,
    );
  }

  Future<void> run(Future<void> Function() work) async {
    setState(() { working = true; problem = null; });
    try {
      await work();
    } catch (e) {
      if (mounted) setState(() => problem = '$e');
    }
    if (mounted) setState(() => working = false);
  }

  Future<Map> request() async => {
        'channels': chosen.toList(),
        'days': (days.toList()..sort()),
        'times': times.map(time).toList(),
        'start': '${start.year}-${start.month.toString().padLeft(2, '0')}-${start.day.toString().padLeft(2, '0')}',
        'timezone': await (widget.timezone ?? () async => 'UTC')(),
      };

  void preview() => run(() async {
        final body = await request();
        final answer = await widget.api.call('POST', '/projects/${widget.projectId}/calendar/plan', body);
        setState(() => plan = {...answer, 'request': body});
      });

  void schedule() => run(() async {
        try {
          await widget.api.call('POST', '/projects/${widget.projectId}/calendar', plan!['request']);
          setState(() => plan = null);
        } finally {
          widget.onScheduled();
        }
      });

  @override
  Widget build(BuildContext context) => Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Heading(before: 'Schedule your ', accent: 'approved clips', size: 22),
        const SizedBox(height: 12),
        if (channels == null && problem == null) const Center(child: CircularProgressIndicator()),
        if (channels != null) ChannelPicker(channels: channels!, chosen: chosen, onChanged: (next) => setState(() { chosen = next; plan = null; })),
        const SizedBox(height: 12),
        const Text('Days', style: TextStyle(fontWeight: FontWeight.w500)),
        const SizedBox(height: 8),
        Wrap(spacing: 6, runSpacing: 6, children: [
          for (var n = 1; n <= 7; n++)
            FilterChip(
              label: Text(weekdays[n - 1]), selected: days.contains(n), showCheckmark: false, shape: const StadiumBorder(),
              selectedColor: accent, labelStyle: TextStyle(color: days.contains(n) ? Colors.white : ink, fontWeight: FontWeight.w500),
              onSelected: (on) => setState(() { days = on ? {...days, n} : ({...days}..remove(n)); plan = null; }),
            ),
        ]),
        const SizedBox(height: 12),
        const Text('Times', style: TextStyle(fontWeight: FontWeight.w500)),
        const SizedBox(height: 8),
        Wrap(spacing: 6, runSpacing: 6, children: [
          for (final (i, t) in times.indexed)
            Chip(label: Text(time(t)), onDeleted: times.length == 1 ? null : () => setState(() { times = [...times]..removeAt(i); plan = null; })),
          if (times.length < 6)
            ActionChip(avatar: const Icon(Icons.add_rounded, size: 18), label: const Text('Add a time'), onPressed: () async {
              final t = await showTimePicker(context: context, initialTime: const TimeOfDay(hour: 18, minute: 0));
              if (t != null) setState(() { times = [...times, t]; plan = null; });
            }),
        ]),
        const SizedBox(height: 12),
        OutlinedButton.icon(
          icon: const Icon(Icons.event_rounded, size: 18),
          label: Text('Starting ${weekdays[start.weekday - 1]} ${start.day}/${start.month}'),
          onPressed: () async {
            final now = DateTime.now();
            final day = await showDatePicker(context: context, firstDate: now, lastDate: now.add(const Duration(days: 30)), initialDate: start);
            if (day != null) setState(() { start = day; plan = null; });
          },
        ),
        if (problem != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(problem!, style: const TextStyle(color: danger))),
        const SizedBox(height: 16),
        if (plan == null)
          FilledButton(
            onPressed: working || chosen.isEmpty || days.isEmpty ? null : preview,
            child: Text(working ? 'Planning...' : 'Preview the calendar'),
          )
        else ...[
          const Text('Preview', style: TextStyle(fontWeight: FontWeight.w600)),
          for (final post in plan!['posts'])
            ListTile(contentPadding: EdgeInsets.zero, dense: true, title: Text(post['title']), subtitle: Text(when(post['due_at']))),
          if ((plan!['left'] as List).isNotEmpty)
            Text("${plural((plan!['left'] as List).length, 'clip')} didn't fit in the next 30 days. Add days or times.", style: const TextStyle(color: muted)),
          const SizedBox(height: 12),
          FilledButton(onPressed: working ? null : schedule, child: Text(working ? 'Scheduling...' : 'Schedule ${plural((plan!['posts'] as List).length, 'clip')}')),
        ],
      ])));
}
