# Auto-recover AP API when VPS comes back online
$sshKey = "$env:USERPROFILE\.ssh\ap-vps-deploy"
$vpsHost = "root@62.72.56.74"
$maxAttempts = 120  # ~30 min at 15s intervals

for ($i = 1; $i -le $maxAttempts; $i++) {
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Attempt $i - SSH to VPS..."
    $result = ssh -i $sshKey -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new $vpsHost @"
cd /var/www/ap-services
systemctl start redis-server 2>/dev/null || systemctl start redis 2>/dev/null || true
pm2 reload ap-api --update-env || pm2 restart ap-api --update-env || pm2 start ecosystem.config.js
pm2 save
sleep 3
curl -sf http://127.0.0.1:5000/api/health && echo '' && echo RECOVERY_OK
"@ 2>&1
    if ($LASTEXITCODE -eq 0 -and ($result -match 'RECOVERY_OK|online')) {
        Write-Host "SUCCESS: API recovered"
        Write-Host $result
        exit 0
    }
    Start-Sleep -Seconds 15
}
Write-Host "VPS still down after $maxAttempts attempts"
exit 1
