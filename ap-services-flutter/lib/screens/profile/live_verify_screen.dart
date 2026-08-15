import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../../services/feature_services.dart';

class LiveVerifyScreen extends StatefulWidget {
  const LiveVerifyScreen({super.key});

  @override
  State<LiveVerifyScreen> createState() => _LiveVerifyScreenState();
}

class _LiveVerifyScreenState extends State<LiveVerifyScreen> {
  int _step = 0;
  bool _busy = false;

  Future<void> _captureFace() async {
    setState(() => _busy = true);
    try {
      final picker = await ImagePicker().pickImage(
        source: ImageSource.camera,
        preferredCameraDevice: CameraDevice.front,
      );
      if (picker != null) {
        await context.read<HostService>().verifyFace(picker.path);
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Verification submitted!')),
          );
          Navigator.pop(context);
        }
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
      appBar: AppBar(title: const Text('Live Verification')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          children: [
            Stepper(
              currentStep: _step,
              onStepContinue: () {
                if (_step < 1) {
                  setState(() => _step++);
                } else {
                  _captureFace();
                }
              },
              onStepCancel: _step > 0 ? () => setState(() => _step--) : null,
              steps: const [
                Step(
                  title: Text('Confirm identity'),
                  content: Text('Use your real name and valid ID on profile.'),
                ),
                Step(
                  title: Text('Selfie check'),
                  content: Text('Take a clear front-facing photo for host verification.'),
                ),
              ],
            ),
            if (_busy) const CircularProgressIndicator(),
          ],
        ),
      ),
    );
  }
}
