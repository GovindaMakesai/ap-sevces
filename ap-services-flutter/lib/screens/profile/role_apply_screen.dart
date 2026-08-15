import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../services/social_service.dart';

class RoleApplyScreen extends StatefulWidget {
  const RoleApplyScreen({super.key});

  @override
  State<RoleApplyScreen> createState() => _RoleApplyScreenState();
}

class _RoleApplyScreenState extends State<RoleApplyScreen> with SingleTickerProviderStateMixin {
  late TabController _tabs;
  final _note = TextEditingController();

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 3, vsync: this);
  }

  @override
  void dispose() {
    _tabs.dispose();
    _note.dispose();
    super.dispose();
  }

  Future<void> _apply(String role) async {
    try {
      await context.read<SocialService>().submitRoleApplication(
            roleType: role,
            payload: {'note': _note.text.trim()},
          );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('$role application submitted')),
        );
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Apply for Role'),
        bottom: TabBar(
          controller: _tabs,
          isScrollable: true,
          tabs: const [Tab(text: 'Host'), Tab(text: 'Agency'), Tab(text: 'Seller')],
        ),
      ),
      body: TabBarView(
        controller: _tabs,
        children: ['host', 'agency', 'seller'].map(_form).toList(),
      ),
    );
  }

  Widget _form(String role) {
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        children: [
          TextField(
            controller: _note,
            maxLines: 4,
            decoration: const InputDecoration(labelText: 'Tell us about yourself'),
          ),
          const Spacer(),
          ElevatedButton(
            onPressed: () => _apply(role),
            child: Text('Apply as ${role[0].toUpperCase()}${role.substring(1)}'),
          ),
        ],
      ),
    );
  }
}
