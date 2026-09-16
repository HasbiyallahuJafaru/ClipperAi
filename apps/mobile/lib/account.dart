import 'package:clerk_flutter/clerk_flutter.dart';
// Clerk's own account screen; the package doesn't export it yet (the version is pinned exactly, so this can't shift).
// ignore: implementation_imports
import 'package:clerk_flutter/src/widgets/user/clerk_user_profile.dart';
import 'package:flutter/material.dart';
import 'package:phosphor_icons/phosphor_icons.dart';

import 'api.dart';
import 'home.dart';
import 'main.dart';
import 'publish.dart';
import 'ui.dart';

/// Where clips go out: Buffer's connection and the social accounts it can post to.
class PublishingPage extends StatefulWidget {
  const PublishingPage({super.key, required this.api});
  final Api api;

  @override
  State<PublishingPage> createState() => _PublishingPageState();
}

class _PublishingPageState extends State<PublishingPage> with Polling {
  @override
  Future fetch() => widget.api.call('GET', '/publishing/channels');

  @override
  Widget build(BuildContext context) {
    final channels = data as List?;
    final ready = channels?.where((c) => c['usable'] == true).length ?? 0;
    return SafeArea(
      bottom: false,
      child: RefreshIndicator(
        onRefresh: load,
        child: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, shellBottom), children: [
          const PageTop(),
          const SizedBox(height: 20),
          const Heading(before: 'Where your clips\n', accent: 'go out', size: 30),
          const SizedBox(height: 10),
          const Text(
            'Approved clips are posted through Buffer. Your social accounts are connected in Buffer, so YT-Clipper '
            'never sees their passwords.',
            style: TextStyle(color: muted, height: 1.45),
          ),
          const SizedBox(height: 20),
          Panel(child: Row(children: [
            Container(
              width: 44, height: 44, alignment: Alignment.center,
              decoration: BoxDecoration(color: ink, borderRadius: BorderRadius.circular(14)),
              child: Icon(PhosphorIconsFill.stack, size: 22, color: Colors.white),
            ),
            const SizedBox(width: 14),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Buffer', style: TextStyle(color: muted, fontSize: 13)),
              if (channels != null) ...[
                Row(children: [
                  Text('Connected', style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(width: 6),
                  Icon(PhosphorIconsFill.checkCircle, size: 17, color: accent),
                ]),
                Text(
                  channels.isEmpty ? 'No channels yet.' : '$ready of ${plural(channels.length, 'channel')} can post clips.',
                  style: const TextStyle(color: muted, fontSize: 13.5),
                ),
              ] else if (error != null) ...[
                Text(
                  '$error'.contains('Buffer') ? 'Not connected' : "Can't check the connection",
                  style: Theme.of(context).textTheme.titleLarge),
                Text('$error', style: const TextStyle(color: danger, fontSize: 13.5)),
              ] else
                const Padding(padding: EdgeInsets.only(top: 6), child: Skeleton(height: 22, width: 140)),
            ])),
          ])),
          const SizedBox(height: 10),
          OutlinedButton.icon(
            onPressed: () => openLink(context, 'https://publish.buffer.com'),
            icon: Icon(PhosphorIconsBold.arrowSquareOut, size: 16, color: ink),
            label: const Text('Open Buffer'),
          ),
          const SizedBox(height: 26),
          const SectionTitle('Channels'),
          if (channels == null)
            const Column(children: [Skeleton(height: 66, radius: 24), SizedBox(height: 10), Skeleton(height: 66, radius: 24)])
          else if (channels.isEmpty)
            const Panel(child: Text(
              'Connect TikTok, Instagram, YouTube or any other account in Buffer, then pull down to refresh.',
              style: TextStyle(color: muted)))
          else
            for (final channel in channels)
              Padding(padding: const EdgeInsets.only(bottom: 10), child: Panel(
                padding: const EdgeInsets.all(12),
                child: Row(children: [
                  NetworkIcon(service: channel['service'], faded: channel['usable'] != true),
                  const SizedBox(width: 12),
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(network(channel['service']), style: const TextStyle(fontWeight: FontWeight.w500)),
                    Text('${channel['displayName'] ?? channel['name']}',
                        maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: muted, fontSize: 13)),
                  ])),
                  const SizedBox(width: 8),
                  channel['usable'] == true
                      ? const StatusChip('Ready', background: accentSoft, color: accentInk)
                      : StatusChip(unusable(channel), background: ground, color: muted),
                ]),
              )),
          const SizedBox(height: 14),
          const Text(
            'Clips can go to TikTok, Instagram, YouTube, LinkedIn, Facebook and X, each with the post written for that '
            'network. Posts can be scheduled up to 30 days ahead.',
            style: TextStyle(color: muted, fontSize: 13, height: 1.45),
          ),
        ]),
      ),
    );
  }
}

/// The plan, what it has been used for this month, and the plans there are. Plans are changed on the website.
class PlanPage extends StatefulWidget {
  const PlanPage({super.key, required this.api});
  final Api api;

  @override
  State<PlanPage> createState() => _PlanPageState();
}

class _PlanPageState extends State<PlanPage> with Polling {
  bool working = false;

  @override
  Future fetch() => widget.api.call('GET', '/billing');

  Future<void> cancel() async {
    final sure = await showDialog<bool>(context: context, builder: (context) => AlertDialog(
      title: const Text('Cancel your plan?'),
      content: const Text("New projects can't start until you choose a plan again."),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Keep it')),
        TextButton(
          onPressed: () => Navigator.pop(context, true),
          style: TextButton.styleFrom(foregroundColor: danger),
          child: const Text('Cancel plan')),
      ],
    ));
    if (sure != true) return;
    setState(() => working = true);
    try {
      await widget.api.call('POST', '/billing/cancel');
    } catch (e) {
      if (mounted) toast(context, e);
    }
    if (mounted) setState(() => working = false);
    await load();
  }

  @override
  Widget build(BuildContext context) => SafeArea(
        bottom: false,
        child: RefreshIndicator(
          onRefresh: load,
          child: loaded(
            waiting: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, shellBottom), children: const [
              SizedBox(height: 80),
              Skeleton(height: 150, radius: 24),
              SizedBox(height: 16),
              Skeleton(height: 120, radius: 24),
            ]),
            (billing) {
              final subscription = billing['subscription'];
              final plans = billing['plans'] as List;
              final plan = subscription == null ? null : plans.firstWhere((p) => p['id'] == subscription['plan']);
              final usage = billing['usage'];
              final history = billing['history'] as List? ?? [];
              return ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, shellBottom), children: [
                const PageTop(),
                const SizedBox(height: 20),
                const Heading(before: 'Your plan and\n', accent: 'what you have used', size: 30),
                const SizedBox(height: 20),
                if (plan != null)
                  Container(
                    decoration: BoxDecoration(
                      borderRadius: panelRadius,
                      border: Border.all(color: accent.withValues(alpha: 0.18)),
                      gradient: const LinearGradient(
                        begin: Alignment.topLeft, end: Alignment.bottomRight,
                        colors: [Color(0xFFE3EBFF), Color(0xFFF5F8FF), Colors.white], stops: [0, 0.55, 1]),
                    ),
                    padding: const EdgeInsets.all(20),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(children: [
                        Container(
                          width: 44, height: 44, alignment: Alignment.center,
                          decoration: BoxDecoration(color: accent, borderRadius: BorderRadius.circular(14)),
                          child: Icon(PhosphorIconsFill.creditCard, size: 22, color: Colors.white),
                        ),
                        const SizedBox(width: 14),
                        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          const Text('Current plan', style: TextStyle(color: muted, fontSize: 13)),
                          Text('${plan['name']}', style: Theme.of(context).textTheme.headlineSmall),
                        ])),
                      ]),
                      const SizedBox(height: 12),
                      Text(
                        '${money(subscription['price_cents'])} a month, not charged during early access. '
                        'Started ${day(subscription['started_at'])}.',
                        style: const TextStyle(color: muted, fontSize: 13.5, height: 1.45),
                      ),
                      const SizedBox(height: 16),
                      Wrap(spacing: 8, runSpacing: 8, children: [
                        OutlinedButton.icon(
                          onPressed: () => openLink(context, '$webUrl/pricing'),
                          icon: Icon(PhosphorIconsBold.arrowSquareOut, size: 16, color: ink),
                          label: const Text('Change plan'),
                        ),
                        OutlinedButton(
                          onPressed: working ? null : cancel,
                          child: Text(working ? 'Cancelling...' : 'Cancel plan'),
                        ),
                      ]),
                    ]),
                  )
                else
                  Panel(padding: const EdgeInsets.all(24), child: Message(
                    icon: PhosphorIconsFill.creditCard,
                    title: 'No plan yet',
                    body: "Choose one on the website to start making clips. It's free during early access.",
                    action: FilledButton.icon(
                      onPressed: () => openLink(context, '$webUrl/pricing'),
                      icon: Icon(PhosphorIconsBold.arrowSquareOut, size: 16, color: Colors.white),
                      label: const Text('See plans'),
                    ),
                  )),
                const SizedBox(height: 26),
                const SectionTitle('This month'),
                Panel(child: Column(children: [
                  for (final (i, (key, label, format)) in [
                    ('videos', 'Videos started', (num n) => n.round().toString()),
                    ('minutes', 'Video processed', hours),
                    ('clips', 'Clips made', (num n) => n.round().toString()),
                  ].indexed) ...[
                    if (i > 0) const SizedBox(height: 18),
                    Row(children: [
                      Expanded(child: Text(label, style: const TextStyle(fontWeight: FontWeight.w500))),
                      Text(
                        '${format(usage[key])}${plan?[key] == null ? '' : ' of ${format(plan![key])}'}',
                        style: const TextStyle(color: muted),
                      ),
                    ]),
                    if (plan?[key] != null) ...[
                      const SizedBox(height: 8),
                      ProgressBar(((usage[key] / plan![key]) * 100).round().clamp(0, 100), label: false),
                    ],
                  ],
                ])),
                const SizedBox(height: 26),
                const SectionTitle('Plans'),
                for (final other in plans)
                  Padding(padding: const EdgeInsets.only(bottom: 10), child: Panel(
                    padding: const EdgeInsets.all(16),
                    ring: other['id'] == plan?['id'] ? accent : line,
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(children: [
                        Expanded(child: Text('${other['name']}', style: Theme.of(context).textTheme.titleMedium)),
                        if (other['id'] == plan?['id'])
                          const StatusChip('Current', background: accentSoft, color: accentInk)
                        else
                          Text('${money(other['price_cents'])} a month', style: const TextStyle(color: muted, fontSize: 13.5)),
                      ]),
                      const SizedBox(height: 6),
                      Text(
                        '${other['videos'] == null ? 'Any number of videos' : plural(other['videos'], 'video')} a month · '
                        '${hours(other['minutes'])} of video · ${plural(other['clips'], 'clip')}',
                        style: const TextStyle(color: muted, fontSize: 13),
                      ),
                    ]),
                  )),
                const SizedBox(height: 6),
                const Text(
                  'Plans are chosen on the website, never in the app.',
                  style: TextStyle(color: muted, fontSize: 13)),
                if (history.isNotEmpty) ...[
                  const SizedBox(height: 26),
                  const SectionTitle('Billing history'),
                  Panel(child: Column(children: [
                    for (final (i, past) in history.indexed) ...[
                      if (i > 0) const Padding(padding: EdgeInsets.symmetric(vertical: 12), child: Divider(color: line, height: 1)),
                      Row(children: [
                        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text('${plans.firstWhere((p) => p['id'] == past['plan'], orElse: () => {'name': past['plan']})['name']}',
                              style: const TextStyle(fontWeight: FontWeight.w500)),
                          Text(day(past['started_at']), style: const TextStyle(color: muted, fontSize: 13)),
                        ])),
                        past['status'] == 'active'
                            ? const StatusChip('Active', background: accentSoft, color: accentInk)
                            : StatusChip('Ended ${day(past['ended_at'])}', background: ground, color: muted),
                      ]),
                    ],
                  ])),
                ],
              ]);
            },
          ),
        ),
      );
}

/// The account: who is signed in, Clerk's own account screen, and the way out.
class AccountPage extends StatelessWidget {
  const AccountPage({super.key, required this.api});
  final Api api;

  @override
  Widget build(BuildContext context) {
    final auth = ClerkAuth.of(context);
    final user = auth.user;
    final organization = auth.organization;
    return SafeArea(
      bottom: false,
      child: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, shellBottom), children: [
        const SizedBox(height: 8),
        const Center(child: Logo(size: 26)),
        const SizedBox(height: 26),
        Center(child: Avatar(url: user?.imageUrl, name: user?.name ?? user?.email ?? '', size: 76)),
        const SizedBox(height: 14),
        Center(child: Text(
          user?.hasName == true ? user!.name : (user?.email ?? 'Signed in'),
          style: Theme.of(context).textTheme.headlineSmall)),
        if (user?.email != null && user?.hasName == true)
          Center(child: Text(user!.email!, style: const TextStyle(color: muted))),
        if (organization != null)
          Padding(padding: const EdgeInsets.only(top: 10), child: Center(
            child: StatusChip(organization.name, background: accentSoft, color: accentInk, icon: PhosphorIconsFill.buildings))),
        const SizedBox(height: 28),
        Panel(padding: EdgeInsets.zero, child: Column(children: [
          _Row(
            icon: PhosphorIconsRegular.userCircle,
            label: 'Manage account',
            detail: 'Name, email, password and sign-in',
            onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const _ProfilePage())),
          ),
          const Divider(color: line, height: 1, indent: 56),
          _Row(
            icon: PhosphorIconsRegular.buildings,
            label: 'Workspaces',
            detail: 'Switch between your own work and a team',
            onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const _OrganizationsPage())),
          ),
          const Divider(color: line, height: 1, indent: 56),
          _Row(
            icon: PhosphorIconsRegular.globe,
            label: 'Open the website',
            detail: 'Plans, payment and everything else',
            onTap: () => openLink(context, webUrl),
          ),
        ])),
        const SizedBox(height: 16),
        OutlinedButton.icon(
          onPressed: () => auth.signOut(),
          style: OutlinedButton.styleFrom(foregroundColor: danger, side: const BorderSide(color: lineStrong)),
          icon: Icon(PhosphorIconsRegular.signOut, size: 18, color: danger),
          label: const Text('Sign out'),
        ),
      ]),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.icon, required this.label, required this.detail, required this.onTap});
  final IconData icon;
  final String label, detail;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(children: [
            Icon(icon, size: 22, color: accentInk),
            const SizedBox(width: 14),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(label, style: const TextStyle(fontWeight: FontWeight.w500)),
              Text(detail, style: const TextStyle(color: muted, fontSize: 13)),
            ])),
            Icon(PhosphorIconsBold.caretRight, size: 15, color: muted),
          ]),
        ),
      );
}

class _ProfilePage extends StatelessWidget {
  const _ProfilePage();

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          leading: IconButton(
            tooltip: 'Back',
            icon: Icon(PhosphorIconsBold.caretLeft, size: 20, color: ink),
            onPressed: () => Navigator.of(context).pop(),
          ),
          title: const Text('Account'),
        ),
        body: const SingleChildScrollView(padding: EdgeInsets.all(16), child: ClerkUserProfile()),
      );
}

class _OrganizationsPage extends StatelessWidget {
  const _OrganizationsPage();

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          leading: IconButton(
            tooltip: 'Back',
            icon: Icon(PhosphorIconsBold.caretLeft, size: 20, color: ink),
            onPressed: () => Navigator.of(context).pop(),
          ),
          title: const Text('Workspaces'),
        ),
        body: const SingleChildScrollView(padding: EdgeInsets.all(16), child: ClerkOrganizationList()),
      );
}
