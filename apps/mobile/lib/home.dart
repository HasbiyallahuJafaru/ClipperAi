import 'package:clerk_flutter/clerk_flutter.dart';
import 'package:flutter/material.dart';
import 'package:phosphor_icons/phosphor_icons.dart';

import 'account.dart';
import 'api.dart';
import 'main.dart';
import 'screens.dart';

/// Room under a page's content for the floating navigation bar.
const shellBottom = 108.0;

/// The signed-in app: four places, one bar, everything the website has.
class HomeShell extends StatefulWidget {
  const HomeShell({super.key, required this.api, this.shared, this.timezone});
  final Api api;
  final Stream<Shared>? shared; // links and videos shared to the app from other apps
  final Future<String> Function()? timezone;

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int tab = 0;
  final opened = {0}; // a page is built the first time it is opened, so unseen tabs cost no requests

  Widget page(int index) => switch (index) {
        0 => ProjectsPage(api: widget.api, shared: widget.shared, timezone: widget.timezone),
        1 => PublishingPage(api: widget.api),
        2 => PlanPage(api: widget.api),
        _ => AccountPage(api: widget.api),
      };

  @override
  Widget build(BuildContext context) {
    final user = ClerkAuth.userOf(context);
    final organization = ClerkAuth.of(context).organization;
    return Account(
      name: organization?.name ?? (user?.hasName == true ? user!.name : user?.email ?? ''),
      imageUrl: user?.imageUrl,
      child: Scaffold(
        body: IndexedStack(
          index: tab,
          children: [for (var i = 0; i < 4; i++) opened.contains(i) ? page(i) : const SizedBox.shrink()],
        ),
        bottomNavigationBar: NavBar(
          current: tab,
          onChanged: (next) => setState(() {
            tab = next;
            opened.add(next);
          }),
        ),
      ),
    );
  }
}

/// Who is signed in, for the top of every page (the pages never talk to Clerk themselves).
class Account extends InheritedWidget {
  const Account({super.key, required this.name, required this.imageUrl, required super.child});
  final String name;
  final String? imageUrl;

  static Account? maybeOf(BuildContext context) => context.dependOnInheritedWidgetOfExactType<Account>();

  @override
  bool updateShouldNotify(Account old) => old.name != name || old.imageUrl != imageUrl;
}

/// The floating bar: Projects, Publishing, Plan, Account.
class NavBar extends StatelessWidget {
  const NavBar({super.key, required this.current, required this.onChanged});
  final int current;
  final ValueChanged<int> onChanged;

  static const items = [
    ('Projects', PhosphorIconsRegular.squaresFour, PhosphorIconsFill.squaresFour),
    ('Publishing', PhosphorIconsRegular.shareNetwork, PhosphorIconsFill.shareNetwork),
    ('Plan', PhosphorIconsRegular.creditCard, PhosphorIconsFill.creditCard),
    ('Account', PhosphorIconsRegular.userCircle, PhosphorIconsFill.userCircle),
  ];

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.fromLTRB(16, 0, 16, 12 + MediaQuery.viewPaddingOf(context).bottom),
        child: DecoratedBox(
          decoration: const BoxDecoration(color: surface, borderRadius: panelRadius, boxShadow: floatShadow),
          child: ClipRRect(
            borderRadius: panelRadius,
            child: Row(children: [
              for (final (index, (label, icon, filled)) in items.indexed)
                Expanded(child: _NavItem(
                  label: label,
                  icon: index == current ? filled : icon,
                  selected: index == current,
                  onTap: () => onChanged(index),
                )),
            ]),
          ),
        ),
      );
}

class _NavItem extends StatelessWidget {
  const _NavItem({required this.label, required this.icon, required this.selected, required this.onTap});
  final String label;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
        selected: selected,
        button: true,
        child: InkWell(
          onTap: onTap,
          child: SizedBox(
            height: 64,
            child: Stack(children: [
              if (selected) Align(alignment: Alignment.topCenter, child: Container(
                width: 30, height: 3,
                decoration: const BoxDecoration(
                  color: accent, borderRadius: BorderRadius.vertical(bottom: Radius.circular(3))),
              )),
              Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
                Icon(icon, size: 23, color: selected ? accent : muted),
                const SizedBox(height: 4),
                Text(label, style: TextStyle(
                  fontSize: 11.5, fontWeight: FontWeight.w500, color: selected ? accentInk : muted)),
              ])),
            ]),
          ),
        ),
      );
}

/// Every page's top row: who you are on the left, actions on the right.
class PageTop extends StatelessWidget {
  const PageTop({super.key, this.actions = const []});
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    final account = Account.maybeOf(context);
    return Row(children: [
      if (account != null) Flexible(child: Container(
        padding: const EdgeInsets.fromLTRB(6, 6, 14, 6),
        decoration: const ShapeDecoration(color: surface, shape: StadiumBorder(side: BorderSide(color: line))),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Avatar(url: account.imageUrl, name: account.name, size: 26),
          const SizedBox(width: 8),
          Flexible(child: Text(account.name, overflow: TextOverflow.ellipsis, style: const TextStyle(
            fontSize: 13.5, fontWeight: FontWeight.w500, color: ink))),
        ]),
      )),
      const Spacer(),
      ...actions,
    ]);
  }
}

/// The account picture, or its first letter while there is none.
class Avatar extends StatelessWidget {
  const Avatar({super.key, this.url, this.name = '', this.size = 36});
  final String? url;
  final String name;
  final double size;

  @override
  Widget build(BuildContext context) {
    final letter = name.trim().isEmpty ? '?' : name.trim()[0].toUpperCase();
    return Container(
      width: size, height: size, alignment: Alignment.center, clipBehavior: Clip.antiAlias,
      decoration: const BoxDecoration(color: accentSoft, shape: BoxShape.circle),
      child: url == null || url!.isEmpty
          ? Text(letter, style: TextStyle(fontSize: size * 0.42, fontWeight: FontWeight.w600, color: accentInk))
          : Image.network(url!, width: size, height: size, fit: BoxFit.cover,
              errorBuilder: (context, error, stack) => Text(letter, style: TextStyle(
                fontSize: size * 0.42, fontWeight: FontWeight.w600, color: accentInk))),
    );
  }
}
