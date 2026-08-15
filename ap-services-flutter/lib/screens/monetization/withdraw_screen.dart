import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../../services/wallet_service.dart';

class WithdrawScreen extends StatefulWidget {
  const WithdrawScreen({super.key});

  @override
  State<WithdrawScreen> createState() => _WithdrawScreenState();
}

class _WithdrawScreenState extends State<WithdrawScreen> with SingleTickerProviderStateMixin {
  late TabController _tabs;
  final _amount = TextEditingController();
  final _points = TextEditingController();
  String? _qrPath;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabs.dispose();
    _amount.dispose();
    _points.dispose();
    super.dispose();
  }

  Future<void> _pickQr() async {
    final file = await ImagePicker().pickImage(source: ImageSource.gallery);
    if (file != null) setState(() => _qrPath = file.path);
  }

  Future<void> _withdrawCash() async {
    setState(() => _busy = true);
    try {
      await context.read<WalletService>().submitWithdraw(
            amount: num.tryParse(_amount.text) ?? 0,
            qrPath: _qrPath,
          );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Withdrawal submitted')),
        );
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _exchangePoints() async {
    setState(() => _busy = true);
    try {
      await context.read<WalletService>().exchangePoints(int.tryParse(_points.text) ?? 0);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Points exchanged to coins')),
        );
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Withdraw / Exchange'),
        bottom: TabBar(
          controller: _tabs,
          tabs: const [
            Tab(text: 'Cash Withdraw'),
            Tab(text: 'Exchange to Coins'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabs,
        children: [
          Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              children: [
                TextField(
                  controller: _amount,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'Amount (INR)'),
                ),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  onPressed: _pickQr,
                  icon: const Icon(Icons.qr_code),
                  label: Text(_qrPath == null ? 'Upload UPI/Bank QR' : 'QR selected'),
                ),
                const Spacer(),
                ElevatedButton(
                  onPressed: _busy ? null : _withdrawCash,
                  child: _busy ? const CircularProgressIndicator() : const Text('Submit Withdrawal'),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              children: [
                TextField(
                  controller: _points,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'Points to exchange'),
                ),
                const Spacer(),
                ElevatedButton(
                  onPressed: _busy ? null : _exchangePoints,
                  child: const Text('Exchange to Coins'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
