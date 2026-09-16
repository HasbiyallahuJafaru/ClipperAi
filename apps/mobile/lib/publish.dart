import 'package:flutter/material.dart';
import 'package:phosphor_icons/phosphor_icons.dart';

import 'api.dart';
import 'main.dart';
import 'screens.dart';
import 'ui.dart';

/// Buffer's network names (publishing.py SERVICES), for people.
const networks = {
  'tiktok': 'TikTok', 'instagram': 'Instagram', 'youtube': 'YouTube', 'linkedin': 'LinkedIn', 'facebook': 'Facebook',
  'twitter': 'X',
};

const networkIcons = {
  'tiktok': PhosphorIconsFill.tiktokLogo, 'instagram': PhosphorIconsFill.instagramLogo,
  'youtube': PhosphorIconsFill.youtubeLogo, 'linkedin': PhosphorIconsFill.linkedinLogo,
  'facebook': PhosphorIconsFill.facebookLogo, 'twitter': PhosphorIconsFill.xLogo,
};

String network(String service) => networks[service] ?? service;

/// When a post belongs on the calendar: its due time, when it went out, or when it was made.
String postTime(Map post) => '${post['due_at'] ?? post['sent_at'] ?? post['created_at'] ?? ''}';

String time(TimeOfDay t) => '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

/// Why a channel can't take clips ('' when it can), in the website's words.
String unusable(Map channel) => channel['usable'] == true
    ? ''
    : channel['isDisconnected'] == true
        ? 'Reconnect it in Buffer'
        : channel['isLocked'] == true
            ? 'Locked by your Buffer plan'
            : channel['service'] == 'instagram' && channel['type'] == 'profile'
                ? 'Needs an Instagram creator or business account'
                : "Clips can't be posted here yet";

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
      builder: (_) => Padding(padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom), child: child),
    );

/// A network's logo in a small tile (a generic mark for networks clips can't go to).
class NetworkIcon extends StatelessWidget {
  const NetworkIcon({super.key, required this.service, this.size = 40, this.faded = false});
  final String service;
  final double size;
  final bool faded;

  @override
  Widget build(BuildContext context) => Opacity(
        opacity: faded ? 0.45 : 1,
        child: Container(
          width: size, height: size, alignment: Alignment.center,
          decoration: BoxDecoration(color: ground, borderRadius: BorderRadius.circular(size * 0.3)),
          child: Icon(networkIcons[service] ?? PhosphorIconsFill.broadcast, size: size * 0.55, color: ink),
        ),
      );
}

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

  @override
  void dispose() {
    for (final controller in [title, hook, description, hashtags, ...posts.values]) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> save() async {
    setState(() {
      saving = true;
      problem = null;
    });
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
      if (mounted) {
        setState(() {
          saving = false;
          problem = '$e';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => ListView(shrinkWrap: true, padding: const EdgeInsets.fromLTRB(20, 24, 20, 24), children: [
        const Heading(before: 'Edit ', accent: 'clip', size: 24),
        const SizedBox(height: 16),
        TextField(controller: title, maxLength: 300, decoration: const InputDecoration(labelText: 'Title')),
        const SizedBox(height: 8),
        TextField(controller: hook, maxLength: 300, decoration: const InputDecoration(
          labelText: 'Hook', helperText: 'An opening line for your post or voiceover')),
        const SizedBox(height: 8),
        TextField(controller: description, maxLines: 3, maxLength: 5000, decoration: const InputDecoration(labelText: 'Description')),
        const SizedBox(height: 8),
        TextField(controller: hashtags, decoration: const InputDecoration(
          labelText: 'Hashtags', helperText: 'Separate them with spaces')),
        for (final MapEntry(:key, :value) in platforms.entries) ...[
          const SizedBox(height: 16),
          TextField(controller: posts[key], maxLines: 4, minLines: 2, decoration: InputDecoration(labelText: '$value post')),
        ],
        if (problem != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(problem!, style: const TextStyle(color: danger))),
        const SizedBox(height: 16),
        FilledButton(onPressed: saving ? null : save, child: Text(saving ? 'Saving...' : 'Save changes')),
      ]);
}

/// The connected social accounts to post to. `reason(channel)` says why one can't be chosen ('' if it can).
class ChannelPicker extends StatelessWidget {
  const ChannelPicker({super.key, required this.channels, required this.chosen, required this.onChanged, this.reason = unusable});
  final List channels;
  final Set<String> chosen;
  final ValueChanged<Set<String>> onChanged;
  final String Function(Map channel) reason;

  @override
  Widget build(BuildContext context) {
    if (channels.isEmpty) {
      return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('No social accounts are connected in Buffer yet.', style: TextStyle(color: muted)),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          onPressed: () => openLink(context, 'https://publish.buffer.com'),
          icon: Icon(PhosphorIconsBold.arrowSquareOut, size: 16, color: ink),
          label: const Text('Connect one in Buffer'),
        ),
      ]);
    }
    return Column(children: [
      for (final channel in channels)
        Builder(builder: (context) {
          final why = reason(channel);
          final picked = chosen.contains(channel['id']);
          return Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Material(
              color: picked ? accentSoft : surface,
              borderRadius: cardRadius,
              child: InkWell(
                borderRadius: cardRadius,
                onTap: why.isNotEmpty
                    ? null
                    : () => onChanged(picked ? ({...chosen}..remove(channel['id'])) : {...chosen, channel['id']}),
                child: Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    borderRadius: cardRadius,
                    border: Border.all(color: picked ? accent : line, width: picked ? 1.5 : 1),
                  ),
                  child: Row(children: [
                    NetworkIcon(service: channel['service'], faded: why.isNotEmpty),
                    const SizedBox(width: 12),
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(network(channel['service']), style: TextStyle(
                        fontWeight: FontWeight.w500, color: why.isEmpty ? ink : muted)),
                      Text(
                        why.isEmpty
                            ? '${channel['displayName'] ?? channel['name']}'
                            : '${network(channel['service'])}: ${why[0].toLowerCase()}${why.substring(1)}',
                        maxLines: 2, overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: muted, fontSize: 13),
                      ),
                    ])),
                    if (why.isEmpty)
                      Icon(
                        picked ? PhosphorIconsFill.checkCircle : PhosphorIconsRegular.circle,
                        size: 22, color: picked ? accent : lineStrong),
                  ]),
                ),
              ),
            ),
          );
        }),
    ]);
  }
}

/// Post one approved clip now or at a chosen time. Pops true once it's sent to Buffer.
class PublishSheet extends StatefulWidget {
  const PublishSheet({super.key, required this.api, required this.projectId, required this.clip, this.taken = const [], this.until});
  final Api api;
  final String projectId;
  final Map clip;
  final List taken; // this clip's posts already sent or scheduled
  final String? until; // the last moment a post can be scheduled for (the files expire)

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

  /// A channel this clip already went to can't be chosen again.
  String reason(Map channel) {
    final post = widget.taken.cast<Map>().where((p) => p['channel_id'] == channel['id'] && p['status'] != 'error').firstOrNull;
    if (post == null) return unusable(channel);
    return ['sent', 'sending'].contains(post['status']) ? 'Already posted' : 'Already scheduled';
  }

  Future<void> pickTime() async {
    final now = DateTime.now();
    final last = widget.until == null ? now.add(const Duration(days: 30)) : DateTime.parse(widget.until!).toLocal();
    final day = await showDatePicker(
      context: context, firstDate: now, lastDate: last.isAfter(now) ? last : now, initialDate: at ?? now);
    if (day == null || !mounted) return;
    final clock = await showTimePicker(context: context, initialTime: TimeOfDay.fromDateTime(at ?? now.add(const Duration(hours: 1))));
    if (clock != null) setState(() => at = DateTime(day.year, day.month, day.day, clock.hour, clock.minute));
  }

  Future<void> send() async {
    setState(() {
      sending = true;
      problem = null;
    });
    try {
      await widget.api.call('POST', '/projects/${widget.projectId}/clips/${widget.clip['idx']}/publish', {
        'channels': chosen.toList(),
        if (at != null) 'due_at': at!.toUtc().toIso8601String(),
      });
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        setState(() {
          sending = false;
          problem = '$e';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => ListView(shrinkWrap: true, padding: const EdgeInsets.fromLTRB(20, 24, 20, 24), children: [
        const Heading(before: 'Publish ', accent: 'this clip', size: 24),
        const SizedBox(height: 4),
        Text(widget.clip['title'], style: const TextStyle(color: muted)),
        const SizedBox(height: 18),
        const Text('Where', style: TextStyle(fontWeight: FontWeight.w600)),
        const Text('Each network gets the post written for it.', style: TextStyle(color: muted, fontSize: 13)),
        const SizedBox(height: 10),
        if (channels == null && problem == null)
          const Column(children: [Skeleton(height: 62, radius: 16), SizedBox(height: 8), Skeleton(height: 62, radius: 16)]),
        if (channels != null)
          ChannelPicker(
            channels: channels!, chosen: chosen, reason: reason,
            onChanged: (next) => setState(() => chosen = next)),
        const SizedBox(height: 12),
        const Text('When', style: TextStyle(fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        SegmentedButton<bool>(
          segments: const [
            ButtonSegment(value: false, label: Text('Post now')),
            ButtonSegment(value: true, label: Text('Schedule')),
          ],
          selected: {at != null},
          onSelectionChanged: (later) => later.first ? pickTime() : setState(() => at = null),
        ),
        if (at != null) ...[
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: pickTime,
            icon: Icon(PhosphorIconsRegular.clock, size: 17, color: ink),
            label: Text(when(at!.toUtc().toIso8601String())),
          ),
          if (widget.until != null)
            Padding(padding: const EdgeInsets.only(top: 6), child: Text(
              'Any time up to ${when(widget.until!)}, while the files last.',
              style: const TextStyle(color: muted, fontSize: 12.5))),
        ],
        if (problem != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(problem!, style: const TextStyle(color: danger))),
        const SizedBox(height: 18),
        FilledButton(
          onPressed: sending || chosen.isEmpty ? null : send,
          child: Text(sending ? (at == null ? 'Posting...' : 'Scheduling...') : (at == null ? 'Post now' : 'Schedule')),
        ),
      ]);
}

/// A clip's posts with their state, a link to the live post and a way to take one off the calendar.
class PostList extends StatefulWidget {
  const PostList({super.key, required this.api, required this.posts, required this.onChange, this.compact = false});
  final Api api;
  final List posts;
  final VoidCallback onChange;
  final bool compact; // on the calendar the time is already shown

  @override
  State<PostList> createState() => _PostListState();
}

class _PostListState extends State<PostList> {
  String? removing;

  Future<void> remove(Map post) async {
    if (post['status'] != 'error') {
      final sure = await showDialog<bool>(context: context, builder: (context) => AlertDialog(
        title: Text('Unschedule the ${network(post['service'])} post?'),
        content: const Text("It won't be sent."),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Keep it')),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            style: TextButton.styleFrom(foregroundColor: danger),
            child: const Text('Unschedule')),
        ],
      ));
      if (sure != true) return;
    }
    setState(() => removing = post['id']);
    try {
      await widget.api.call('DELETE', '/publications/${post['id']}');
    } catch (e) {
      if (mounted) toast(context, e);
    }
    if (mounted) setState(() => removing = null);
    widget.onChange();
  }

  @override
  Widget build(BuildContext context) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (!widget.compact) ...[
          const SizedBox(height: 14),
          const Divider(color: line, height: 1),
          const SizedBox(height: 12),
          const Text('Posts', style: TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
        ],
        for (final post in widget.posts)
          Padding(padding: const EdgeInsets.only(bottom: 8), child: Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(color: ground, borderRadius: cardRadius),
            child: Row(children: [
              NetworkIcon(service: post['service'], size: 32),
              const SizedBox(width: 10),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('${network(post['service'])} · ${post['channel_name'] ?? ''}',
                    maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w500)),
                Text(
                  widget.compact ? postState(post).replaceFirst(RegExp(r' (for|at) .*'), '') : postState(post),
                  style: TextStyle(
                    fontSize: 12.5,
                    color: post['status'] == 'error' ? danger : post['status'] == 'sent' ? accentInk : muted,
                  ),
                ),
              ])),
              if (post['external_link'] != null)
                IconButton(
                  tooltip: 'View post',
                  icon: Icon(PhosphorIconsBold.arrowSquareOut, size: 17, color: muted),
                  onPressed: () => openLink(context, post['external_link']),
                ),
              if (!['sent', 'sending'].contains(post['status']))
                IconButton(
                  tooltip: post['status'] == 'error' ? 'Dismiss' : 'Unschedule',
                  icon: removing == post['id']
                      ? const SizedBox.square(dimension: 16, child: CircularProgressIndicator(strokeWidth: 2))
                      : Icon(PhosphorIconsBold.x, size: 15, color: muted),
                  onPressed: removing == null ? () => remove(post) : null,
                ),
            ]),
          )),
      ]);
}

/// The project's content calendar: every post day by day, and a form that spreads approved clips over days and times.
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
  Future fetch() async {
    final posts = await widget.api.call('GET', '/projects/${widget.projectId}/publications');
    final project = await widget.api.call('GET', '/projects/${widget.projectId}');
    return {...posts, 'project': project};
  }

  @override
  bool busy(data) => (data['publications'] as List).any((p) => ['queued', 'sending'].contains(p['status']));

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          leading: IconButton(
            tooltip: 'Back',
            icon: Icon(PhosphorIconsBold.caretLeft, size: 20, color: ink),
            onPressed: () => Navigator.of(context).pop(),
          ),
          title: const Text('Calendar'),
        ),
        body: loaded((data) {
          final posts = [...data['publications']]..sort((a, b) => postTime(a).compareTo(postTime(b)));
          final project = data['project'] as Map;
          final clips = project['clips'] as List? ?? [];
          final titles = {for (final clip in clips) clip['idx']: clip['title']};
          final onCalendar = {for (final p in posts.where((p) => p['status'] != 'error')) p['clip_idx']};
          final approved = clips.where((c) => c['review'] == 'approved').toList();
          final open = approved.where((c) => !onCalendar.contains(c['idx'])).length;
          final live = data['schedule_until'] != null;
          return RefreshIndicator(
            onRefresh: load,
            child: ListView(padding: const EdgeInsets.fromLTRB(16, 4, 16, 40), children: [
              if (!live)
                const Panel(padding: EdgeInsets.all(24), child: Message(
                  icon: PhosphorIconsBold.prohibit, tone: muted,
                  title: 'The files have expired',
                  body: "This project's clips can't be scheduled any more.",
                ))
              else if (open == 0)
                Panel(padding: const EdgeInsets.all(24), child: Message(
                  icon: PhosphorIconsFill.checkCircle,
                  title: approved.isEmpty ? 'No clips approved yet' : 'Every approved clip is scheduled',
                  body: approved.isEmpty
                      ? 'Approve the clips you want to post, then come back to spread them over the coming weeks.'
                      : 'Approve more clips to add them to the calendar.',
                  action: OutlinedButton(
                    onPressed: () => Navigator.of(context).pop(),
                    child: const Text('Review clips')),
                ))
              else
                ScheduleForm(
                  api: widget.api, projectId: widget.projectId, timezone: widget.timezone, count: open, onScheduled: load),
              const SizedBox(height: 22),
              SectionTitle(posts.isEmpty ? 'Scheduled and posted' : plural(posts.length, 'post')),
              if (posts.isEmpty)
                const Panel(child: Text(
                  'Nothing yet. Scheduled posts show up here, day by day.', style: TextStyle(color: muted)))
              else
                for (final MapEntry(key: label, value: dayPosts) in _byDay(posts).entries)
                  Padding(padding: const EdgeInsets.only(bottom: 12), child: Panel(
                    padding: const EdgeInsets.fromLTRB(16, 14, 12, 14),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(label, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
                      const SizedBox(height: 10),
                      for (final post in dayPosts) ...[
                        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          SizedBox(width: 54, child: Text(
                            postTime(post).isEmpty ? '' : timeLabel(postTime(post)),
                            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: accentInk))),
                          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text('Clip ${post['clip_idx']} on ${network(post['service'])}',
                                style: const TextStyle(fontWeight: FontWeight.w500)),
                            if (titles[post['clip_idx']] != null)
                              Text('${titles[post['clip_idx']]}', maxLines: 1, overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(color: muted, fontSize: 13)),
                            PostList(api: widget.api, posts: [post], onChange: load, compact: true),
                          ])),
                        ]),
                      ],
                    ]),
                  )),
            ]),
          );
        }),
      );

  Map<String, List> _byDay(List posts) {
    final days = <String, List>{};
    for (final post in posts) {
      final at = postTime(post);
      days.putIfAbsent(at.isEmpty ? 'Waiting for a time' : dayLabel(at), () => []).add(post);
    }
    return days;
  }
}

class ScheduleForm extends StatefulWidget {
  const ScheduleForm({super.key, required this.api, required this.projectId, required this.onScheduled, required this.count, this.timezone});
  final Api api;
  final String projectId;
  final VoidCallback onScheduled;
  final int count; // approved clips that aren't on the calendar yet
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
    setState(() {
      working = true;
      problem = null;
    });
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

  void changed(VoidCallback change) => setState(() {
        change();
        plan = null;
      });

  @override
  Widget build(BuildContext context) => Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Heading(before: 'Schedule your ', accent: 'approved clips', size: 22),
        const SizedBox(height: 6),
        Text(
          '${plural(widget.count, 'clip')} waiting. One at each posting time, in clip order, up to 30 days ahead.',
          style: const TextStyle(color: muted, fontSize: 13.5)),
        const SizedBox(height: 16),
        const Text('Where', style: TextStyle(fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        if (channels == null && problem == null)
          const Column(children: [Skeleton(height: 62, radius: 16), SizedBox(height: 8), Skeleton(height: 62, radius: 16)]),
        if (channels != null)
          ChannelPicker(
            channels: channels!, chosen: chosen, onChanged: (next) => changed(() => chosen = next)),
        const SizedBox(height: 12),
        const Text('Days', style: TextStyle(fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        Wrap(spacing: 6, runSpacing: 6, children: [
          for (var n = 1; n <= 7; n++)
            FilterChip(
              label: Text(weekdays[n - 1]),
              selected: days.contains(n),
              showCheckmark: false,
              shape: const StadiumBorder(side: BorderSide(color: lineStrong)),
              backgroundColor: surface,
              selectedColor: accent,
              side: days.contains(n) ? const BorderSide(color: accent) : const BorderSide(color: lineStrong),
              labelStyle: TextStyle(color: days.contains(n) ? Colors.white : ink, fontWeight: FontWeight.w500),
              onSelected: (on) => changed(() => days = on ? {...days, n} : ({...days}..remove(n))),
            ),
        ]),
        const SizedBox(height: 14),
        const Text('Times', style: TextStyle(fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        Wrap(spacing: 6, runSpacing: 6, children: [
          for (final (i, t) in times.indexed)
            Chip(
              label: Text(time(t)),
              backgroundColor: ground,
              shape: const StadiumBorder(side: BorderSide(color: line)),
              onDeleted: times.length == 1 ? null : () => changed(() => times = [...times]..removeAt(i)),
            ),
          if (times.length < 6)
            ActionChip(
              avatar: Icon(PhosphorIconsBold.plus, size: 15, color: accentInk),
              label: const Text('Add a time'),
              backgroundColor: surface,
              shape: const StadiumBorder(side: BorderSide(color: lineStrong)),
              onPressed: () async {
                final t = await showTimePicker(context: context, initialTime: const TimeOfDay(hour: 18, minute: 0));
                if (t != null) changed(() => times = [...times, t]);
              },
            ),
        ]),
        const SizedBox(height: 14),
        OutlinedButton.icon(
          icon: Icon(PhosphorIconsRegular.calendarBlank, size: 17, color: ink),
          label: Text('Starting ${weekdays[start.weekday - 1]} ${start.day}/${start.month}'),
          onPressed: () async {
            final now = DateTime.now();
            final picked = await showDatePicker(
              context: context, firstDate: now, lastDate: now.add(const Duration(days: 30)), initialDate: start);
            if (picked != null) changed(() => start = picked);
          },
        ),
        if (problem != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(problem!, style: const TextStyle(color: danger))),
        const SizedBox(height: 18),
        if (plan == null)
          FilledButton(
            onPressed: working || chosen.isEmpty || days.isEmpty ? null : preview,
            child: Text(working ? 'Planning...' : 'Preview the calendar'),
          )
        else ...[
          const Text('Preview', style: TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          for (final post in plan!['posts'])
            Padding(padding: const EdgeInsets.only(bottom: 8), child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              SizedBox(width: 108, child: Text(when(post['due_at']), style: const TextStyle(
                fontSize: 13, fontWeight: FontWeight.w500, color: accentInk))),
              Expanded(child: Text('${post['title']}', maxLines: 2, overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 13.5))),
            ])),
          if ((plan!['left'] as List).isNotEmpty)
            Text(
              "${plural((plan!['left'] as List).length, 'clip')} didn't fit in the next 30 days. Add days or times.",
              style: const TextStyle(color: muted, fontSize: 13)),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: working ? null : schedule,
            child: Text(working ? 'Scheduling...' : 'Schedule ${plural((plan!['posts'] as List).length, 'clip')}'),
          ),
        ],
      ]));
}
