# Numeric counters for benchmark-owned PIDs only; never enumerate command lines.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$taskProcesses = @{}
try {
    while ($null -ne ($taskLine = [Console]::ReadLine())) {
        $taskRequest = ConvertFrom-Json $taskLine
        if (@($taskRequest.pids).Count -gt 8) { throw 'Too many process IDs' }
        $taskCpu = @{}
        $taskMissing = @()
        foreach ($taskProcessId in (@($taskRequest.pids) + @($PID) | Select-Object -Unique)) {
            $taskId = [int]$taskProcessId
            if ($taskId -le 0) { throw 'Invalid process ID' }
            try {
                if (-not $taskProcesses.ContainsKey($taskId)) {
                    $taskProcess = [System.Diagnostics.Process]::GetProcessById($taskId)
                    $null = $taskProcess.Handle # Retain handle for final CPU after exit.
                    $taskProcesses[$taskId] = $taskProcess
                }
                $taskCpu[[string]$taskId] = $taskProcesses[$taskId].TotalProcessorTime.TotalMilliseconds
            } catch { $taskMissing += $taskId }
        }
        [Console]::WriteLine((ConvertTo-Json -Depth 4 -Compress @{ sequence = [int]$taskRequest.sequence; cpuMs = $taskCpu; missing = $taskMissing }))
    }
} finally {
    foreach ($taskProcess in $taskProcesses.Values) { $taskProcess.Dispose() }
}
