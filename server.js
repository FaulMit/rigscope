const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile, spawn } = require("child_process");
const { detectNativeBridges } = require("./native-bridges");
const nativeRunners = require("./native-runners");
const { dedupeProfiles, safeText, sanitizeProfile } = require("./lib/community-profile");
const { createStaticHandler, readJsonBody, sendDownload, sendJson } = require("./lib/http");
const { guardLocalWrite } = require("./lib/request-guard");

const PORT = Number(process.env.PORT || 8787);
const HOST = "127.0.0.1";
const APP_URL = `http://${HOST}:${PORT}`;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
const COMMUNITY_DIR = path.join(os.homedir(), ".rigscope");
const COMMUNITY_FILE = path.join(COMMUNITY_DIR, "community-profiles.json");
const COMMUNITY_FEED_URL = process.env.RIGSCOPE_COMMUNITY_FEED_URL || process.env.RIGSCOPE_COMMUNITY_RAW_URL || "";
const DEFAULT_SCOREBOARD_URL = "https://rigscope-scoreboard.faulmit.workers.dev";
const SCOREBOARD_URL = (process.env.RIGSCOPE_SCOREBOARD_URL || DEFAULT_SCOREBOARD_URL).replace(/\/+$/, "");
const GITHUB_GIST_ID = process.env.RIGSCOPE_GITHUB_GIST_ID || "";
const GITHUB_TOKEN = process.env.RIGSCOPE_GITHUB_TOKEN || "";
const GIST_FILENAME = process.env.RIGSCOPE_GITHUB_GIST_FILE || "rigscope-community.json";
const FULL_SNAPSHOT_TTL_MS = 30000;
const LIVE_SNAPSHOT_TTL_MS = 500;
const NETWORK_LIVE_TTL_MS = 5000;

const snapshotCache = {
  full: null,
  fullAt: 0,
  fullPromise: null,
  live: null,
  liveAt: 0,
  livePromise: null,
  cpuSample: null,
  nvidiaSmiPath: null,
  nvidiaSmiChecked: false,
  network: null,
  networkAt: 0,
  networkPromise: null
};

function unavailableUpdateStatus() {
  return {
    supported: false,
    status: "unavailable",
    currentVersion: require("./package.json").version,
    availableVersion: null,
    downloaded: false,
    progress: null,
    error: "Updates are available only in the packaged desktop app.",
    lastCheckedAt: null
  };
}

function unavailableUpdateAction() {
  const error = new Error("Updates are available only in the packaged desktop app.");
  error.code = "UPDATES_UNAVAILABLE";
  throw error;
}

let updateController = {
  status: unavailableUpdateStatus,
  check: unavailableUpdateAction,
  download: unavailableUpdateAction,
  install: unavailableUpdateAction
};

function setUpdateController(controller) {
  updateController = controller || updateController;
}

const psSnapshot = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$pf = $env:ProgramFiles
$pf86 = [Environment]::GetEnvironmentVariable("ProgramFiles(x86)")

function Try-Number($v) {
  $n = 0.0
  if ([double]::TryParse(($v -as [string]).Trim(), [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$n)) { return $n }
  return $null
}

function Mask-Id($v) {
  $s = ($v -as [string]).Trim()
  if ([string]::IsNullOrWhiteSpace($s)) { return $null }
  if ($s.Length -le 8) { return "masked" }
  return ($s.Substring(0, 4) + "…" + $s.Substring($s.Length - 4))
}

function Bytes-To-Gb($v) {
  if ($null -eq $v -or $v -eq 0) { return $null }
  return [math]::Round($v / 1GB, 1)
}

function Date-Text($v) {
  if ($null -eq $v) { return $null }
  try {
    if ($v -is [datetime]) { return $v.ToString("yyyy-MM-dd") }
    $s = ($v -as [string]).Trim()
    if ([string]::IsNullOrWhiteSpace($s)) { return $null }
    if ($s -match '^\d{14}') { return "$($s.Substring(0, 4))-$($s.Substring(4, 2))-$($s.Substring(6, 2))" }
    return $s
  } catch {
    return $null
  }
}

$gpu = $null
try {
  $raw = & nvidia-smi --query-gpu=name,driver_version,temperature.gpu,utilization.gpu,memory.used,memory.total,power.draw,power.limit,clocks.current.graphics,clocks.current.memory --format=csv,noheader,nounits 2>$null
  if ($LASTEXITCODE -eq 0 -and $raw) {
    $p = ($raw | Select-Object -First 1).Split(",") | ForEach-Object { $_.Trim() }
    $gpu = [ordered]@{
      name = $p[0]
      driver = $p[1]
      temp = Try-Number $p[2]
      util = Try-Number $p[3]
      memUsed = Try-Number $p[4]
      memTotal = Try-Number $p[5]
      power = Try-Number $p[6]
      powerLimit = Try-Number $p[7]
      graphicsClock = Try-Number $p[8]
      memoryClock = Try-Number $p[9]
    }
  }
} catch {}

$os = Get-CimInstance Win32_OperatingSystem
$computer = Get-CimInstance Win32_ComputerSystem
$board = Get-CimInstance Win32_BaseBoard
$bios = Get-CimInstance Win32_BIOS
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$videoControllers = @(Get-CimInstance Win32_VideoController)
$video = $videoControllers | Select-Object -First 1
$cpuLoad = (Get-CimInstance Win32_Processor | Measure-Object LoadPercentage -Average).Average
$cpuThreads = @()
try {
  $cpuThreads = @(Get-CimInstance Win32_PerfFormattedData_Counters_ProcessorInformation |
    Where-Object { $_.Name -match '^\d+,\d+$' } |
    Sort-Object @{ Expression = { [int](($_.Name -split ',')[0]) } }, @{ Expression = { [int](($_.Name -split ',')[1]) } } |
    ForEach-Object {
      $parts = $_.Name -split ','
      [ordered]@{
        group = [int]$parts[0]
        thread = [int]$parts[1]
        loadPct = [math]::Round(($_.PercentProcessorUtility -as [double]), 1)
        performancePct = [math]::Round(($_.PercentProcessorPerformance -as [double]), 1)
        frequencyMhz = $_.ProcessorFrequency
        userPct = [math]::Round(($_.PercentUserTime -as [double]), 1)
        kernelPct = [math]::Round(($_.PercentPrivilegedUtility -as [double]), 1)
      }
    })
} catch {}
$secureBoot = $null
try { $secureBoot = Confirm-SecureBootUEFI } catch {}
$deviceGuard = $null
try { $deviceGuard = Get-CimInstance -Namespace root\Microsoft\Windows\DeviceGuard -ClassName Win32_DeviceGuard } catch {}

$ramSticks = @(Get-CimInstance Win32_PhysicalMemory | ForEach-Object {
  [ordered]@{
    bank = $_.BankLabel
    slot = $_.DeviceLocator
    manufacturer = $_.Manufacturer
    part = ($_.PartNumber -as [string]).Trim()
    serial = Mask-Id $_.SerialNumber
    sizeGb = [math]::Round($_.Capacity / 1GB, 1)
    speed = $_.Speed
    configuredSpeed = $_.ConfiguredClockSpeed
    formFactor = $_.FormFactor
    type = $_.SMBIOSMemoryType
    voltage = $_.ConfiguredVoltage
  }
})

$topMemory = @(Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 8 | ForEach-Object {
  [ordered]@{
    name = $_.ProcessName
    id = $_.Id
    memoryMb = [math]::Round($_.WorkingSet64 / 1MB, 1)
    cpu = [math]::Round(($_.CPU -as [double]), 1)
  }
})

$topCpu = @(Get-Process | Where-Object { $_.CPU -ne $null } | Sort-Object CPU -Descending | Select-Object -First 8 | ForEach-Object {
  [ordered]@{
    name = $_.ProcessName
    id = $_.Id
    memoryMb = [math]::Round($_.WorkingSet64 / 1MB, 1)
    cpu = [math]::Round(($_.CPU -as [double]), 1)
  }
})

$disks = @(Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | ForEach-Object {
  $used = $_.Size - $_.FreeSpace
  [ordered]@{
    name = $_.DeviceID
    label = $_.VolumeName
    totalGb = [math]::Round($_.Size / 1GB, 1)
    freeGb = [math]::Round($_.FreeSpace / 1GB, 1)
    usedGb = [math]::Round($used / 1GB, 1)
    usedPct = [math]::Round(($used / [math]::Max($_.Size, 1)) * 100, 1)
  }
})

$physicalDiskHealth = @{}
try {
  Get-PhysicalDisk | ForEach-Object {
    $physicalDiskHealth[$_.FriendlyName] = [ordered]@{
      health = $_.HealthStatus.ToString()
      operational = ($_.OperationalStatus -join ", ")
      mediaType = $_.MediaType.ToString()
      busType = $_.BusType.ToString()
    }
  }
} catch {}

$physicalDisks = @(Get-CimInstance Win32_DiskDrive | ForEach-Object {
  $health = $physicalDiskHealth[$_.Model]
  [ordered]@{
    model = ($_.Model -as [string]).Trim()
    serial = Mask-Id $_.SerialNumber
    firmware = $_.FirmwareRevision
    interface = $_.InterfaceType
    mediaType = $_.MediaType
    sizeGb = [math]::Round($_.Size / 1GB, 1)
    status = $_.Status
    health = if ($health) { $health.health } else { $_.Status }
    operational = if ($health) { $health.operational } else { $null }
    busType = if ($health) { $health.busType } else { $_.InterfaceType }
    partitions = $_.Partitions
  }
})

$volumes = @(Get-Volume | Where-Object { $_.DriveLetter } | Sort-Object DriveLetter | ForEach-Object {
  [ordered]@{
    drive = "$($_.DriveLetter):"
    label = $_.FileSystemLabel
    fileSystem = $_.FileSystem
    health = $_.HealthStatus.ToString()
    operational = ($_.OperationalStatus -join ", ")
    totalGb = Bytes-To-Gb $_.Size
    freeGb = Bytes-To-Gb $_.SizeRemaining
    usedPct = if ($_.Size) { [math]::Round((($_.Size - $_.SizeRemaining) / $_.Size) * 100, 1) } else { $null }
  }
})

$gpus = @($videoControllers | ForEach-Object {
  [ordered]@{
    name = $_.Name
    adapterCompatibility = $_.AdapterCompatibility
    videoProcessor = $_.VideoProcessor
    driverVersion = $_.DriverVersion
    driverDate = Date-Text $_.DriverDate
    vramMb = if ($_.PNPDeviceID -eq $video.PNPDeviceID -and $gpu -and $gpu.memTotal) { $gpu.memTotal } else { [math]::Round($_.AdapterRAM / 1MB, 0) }
    currentRefreshRate = $_.CurrentRefreshRate
    currentResolution = if ($_.CurrentHorizontalResolution -and $_.CurrentVerticalResolution) { "$($_.CurrentHorizontalResolution)x$($_.CurrentVerticalResolution)" } else { $null }
    pnp = Mask-Id $_.PNPDeviceID
  }
})

$networkAdapters = @()
try {
  $networkAdapters = @(Get-NetAdapter | Where-Object { $_.Status -ne 'Disabled' } | Sort-Object Status, Name | Select-Object -First 10 | ForEach-Object {
    $adapter = $_
    $ip = Get-NetIPConfiguration -InterfaceIndex $adapter.ifIndex
    [ordered]@{
      name = $adapter.Name
      description = $adapter.InterfaceDescription
      status = $adapter.Status
      linkSpeed = $adapter.LinkSpeed
      mac = if ($adapter.MacAddress) { ($adapter.MacAddress -replace '^(.{8}).+(.{5})$', '$1…$2') } else { $null }
      ipv4 = @($ip.IPv4Address | Select-Object -ExpandProperty IPAddress)
      ipv6 = @($ip.IPv6Address | Select-Object -First 3 -ExpandProperty IPAddress)
      gateway = @($ip.IPv4DefaultGateway | Select-Object -ExpandProperty NextHop)
      dns = @($ip.DNSServer.ServerAddresses | Select-Object -First 4)
    }
  })
} catch {}

$monitors = @()
try {
  $monitorIds = @(Get-CimInstance -Namespace root\wmi -ClassName WmiMonitorID | ForEach-Object {
    $name = -join ($_.UserFriendlyName | Where-Object { $_ -ne 0 } | ForEach-Object { [char]$_ })
    $manufacturer = -join ($_.ManufacturerName | Where-Object { $_ -ne 0 } | ForEach-Object { [char]$_ })
    $serial = -join ($_.SerialNumberID | Where-Object { $_ -ne 0 } | ForEach-Object { [char]$_ })
    [ordered]@{
      name = if ($name) { $name } else { "Generic monitor" }
      manufacturer = $manufacturer
      serial = Mask-Id $serial
      instance = Mask-Id $_.InstanceName
      active = $_.Active
    }
  })
  $desktopMonitors = @(Get-CimInstance Win32_DesktopMonitor | ForEach-Object {
    [ordered]@{
      name = $_.Name
      screenWidth = $_.ScreenWidth
      screenHeight = $_.ScreenHeight
      pnp = Mask-Id $_.PNPDeviceID
      status = $_.Status
    }
  })
  $monitors = @($monitorIds + $desktopMonitors)
} catch {}

$soundDevices = @(Get-CimInstance Win32_SoundDevice | ForEach-Object {
  [ordered]@{
    name = $_.Name
    manufacturer = $_.Manufacturer
    status = $_.Status
    pnp = Mask-Id $_.PNPDeviceID
  }
})

$usbControllers = @(Get-CimInstance Win32_USBController | ForEach-Object {
  [ordered]@{
    name = $_.Name
    manufacturer = $_.Manufacturer
    status = $_.Status
    pnp = Mask-Id $_.PNPDeviceID
  }
})

$usbHubs = @(Get-CimInstance Win32_USBHub | Select-Object -First 40 | ForEach-Object {
  [ordered]@{
    name = $_.Name
    status = $_.Status
    pnp = Mask-Id $_.PNPDeviceID
  }
})

$keyboards = @(Get-CimInstance Win32_Keyboard | ForEach-Object {
  [ordered]@{
    name = $_.Name
    description = $_.Description
    functionKeys = $_.NumberOfFunctionKeys
    status = $_.Status
    pnp = Mask-Id $_.PNPDeviceID
  }
})

$pointingDevices = @(Get-CimInstance Win32_PointingDevice | ForEach-Object {
  [ordered]@{
    name = $_.Name
    manufacturer = $_.Manufacturer
    deviceInterface = $_.DeviceInterface
    buttons = $_.NumberOfButtons
    status = $_.Status
    pnp = Mask-Id $_.PNPDeviceID
  }
})

$pnpDevices = @(Get-CimInstance Win32_PnPEntity | Where-Object { $_.Name -and $_.PNPClass } | Sort-Object PNPClass, Name | Select-Object -First 220 | ForEach-Object {
  [ordered]@{
    name = $_.Name
    class = $_.PNPClass
    manufacturer = $_.Manufacturer
    status = $_.Status
    service = $_.Service
    pnp = Mask-Id $_.PNPDeviceID
  }
})

$systemDrivers = @(Get-CimInstance Win32_SystemDriver | Where-Object { $_.State -eq 'Running' } | Sort-Object Name | Select-Object -First 80 | ForEach-Object {
  [ordered]@{
    name = $_.Name
    displayName = $_.DisplayName
    state = $_.State
    startMode = $_.StartMode
    path = $_.PathName
  }
})

$hotfixes = @(Get-CimInstance Win32_QuickFixEngineering | Sort-Object InstalledOn -Descending | Select-Object -First 12 | ForEach-Object {
  [ordered]@{
    id = $_.HotFixID
    description = $_.Description
    installedOn = if ($_.InstalledOn) { $_.InstalledOn.ToString("yyyy-MM-dd") } else { $null }
    installedBy = $_.InstalledBy
  }
})

function Ping-Target($target) {
  try {
    $r = Test-Connection -ComputerName $target -Count 1 -ErrorAction Stop | Select-Object -First 1
    $latency = if ($r.PSObject.Properties['Latency']) { $r.Latency } elseif ($r.PSObject.Properties['ResponseTime']) { $r.ResponseTime } elseif ($r.Reply) { $r.Reply.RoundtripTime } else { $null }
    return [ordered]@{ target = $target; ok = $true; ms = [math]::Round(($latency -as [double]), 1) }
  } catch {
    return [ordered]@{ target = $target; ok = $false; ms = $null }
  }
}

$events = @()
try {
  $sys = Get-WinEvent -FilterHashtable @{ LogName = 'System'; Level = 1,2,3; StartTime = (Get-Date).AddDays(-14) } -MaxEvents 160 |
    Where-Object { $_.ProviderName -match 'Display|WHEA|Kernel-Power|volmgr|Disk|stornvme|storahci|nvlddmkm' -or $_.Id -in 41,4101,13,14,17,18,19,45,46,129,153,161 }
  $wer = Get-WinEvent -FilterHashtable @{ LogName = 'Application'; Level = 1,2,3; StartTime = (Get-Date).AddDays(-14) } -MaxEvents 220 |
    Where-Object { $_.ProviderName -eq 'Windows Error Reporting' -and $_.Message -match 'LiveKernelEvent|BlueScreen' }
  $events = @($sys + $wer | Sort-Object TimeCreated -Descending | Select-Object -First 12 | ForEach-Object {
    [ordered]@{
      time = $_.TimeCreated.ToString("yyyy-MM-dd HH:mm:ss")
      source = $_.ProviderName
      id = $_.Id
      level = $_.LevelDisplayName
      message = (($_.Message -replace "\s+", " ").Trim())
    }
  })
} catch {}

$dwm = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\Dwm'
$uptime = (Get-Date) - $os.LastBootUpTime
$memTotalMb = [math]::Round($os.TotalVisibleMemorySize / 1024, 0)
$memFreeMb = [math]::Round($os.FreePhysicalMemory / 1024, 0)
$memUsedMb = $memTotalMb - $memFreeMb

[ordered]@{
  generatedAt = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
  machine = [ordered]@{
    os = $os.Caption
    build = $os.BuildNumber
    uptimeHours = [math]::Round($uptime.TotalHours, 1)
    cpu = $cpu.Name.Trim()
    gpu = $video.Name
  }
  inventory = [ordered]@{
    system = [ordered]@{
      manufacturer = $computer.Manufacturer
      model = $computer.Model
      type = $computer.SystemType
      domain = $computer.Domain
      user = $computer.UserName
      totalMemoryGb = [math]::Round($computer.TotalPhysicalMemory / 1GB, 1)
      secureBoot = $secureBoot
      hypervisorPresent = $computer.HypervisorPresent
    }
    os = [ordered]@{
      caption = $os.Caption
      version = $os.Version
      build = $os.BuildNumber
      architecture = $os.OSArchitecture
      locale = $os.Locale
      installDate = if ($os.InstallDate) { $os.InstallDate.ToString("yyyy-MM-dd") } else { $null }
      bootTime = if ($os.LastBootUpTime) { $os.LastBootUpTime.ToString("yyyy-MM-dd HH:mm:ss") } else { $null }
      windowsDirectory = $os.WindowsDirectory
    }
    board = [ordered]@{
      manufacturer = $board.Manufacturer
      product = $board.Product
      version = $board.Version
      serial = Mask-Id $board.SerialNumber
    }
    bios = [ordered]@{
      vendor = $bios.Manufacturer
      version = $bios.SMBIOSBIOSVersion
      releaseDate = if ($bios.ReleaseDate) { $bios.ReleaseDate.ToString("yyyy-MM-dd") } else { $null }
      serial = Mask-Id $bios.SerialNumber
      mode = $bios.BiosCharacteristics -join ", "
    }
    cpu = [ordered]@{
      name = $cpu.Name.Trim()
      manufacturer = $cpu.Manufacturer
      socket = $cpu.SocketDesignation
      architecture = $cpu.Architecture
      family = $cpu.Family
      cores = $cpu.NumberOfCores
      threads = $cpu.NumberOfLogicalProcessors
      maxClockMhz = $cpu.MaxClockSpeed
      currentClockMhz = $cpu.CurrentClockSpeed
      externalClockMhz = $cpu.ExtClock
      l2Kb = $cpu.L2CacheSize
      l3Kb = $cpu.L3CacheSize
      processorId = Mask-Id $cpu.ProcessorId
      virtualization = $cpu.VirtualizationFirmwareEnabled
    }
    gpu = [ordered]@{
      name = $video.Name
      driverVersion = $video.DriverVersion
      driverDate = Date-Text $video.DriverDate
      videoProcessor = $video.VideoProcessor
      vramMb = if ($gpu -and $gpu.memTotal) { $gpu.memTotal } else { [math]::Round($video.AdapterRAM / 1MB, 0) }
    }
    gpus = $gpus
    memory = [ordered]@{
      totalGb = [math]::Round($computer.TotalPhysicalMemory / 1GB, 1)
      modules = $ramSticks
    }
    physicalDisks = $physicalDisks
    volumes = $volumes
    networkAdapters = $networkAdapters
    monitors = $monitors
    soundDevices = $soundDevices
    usbControllers = $usbControllers
    usbHubs = $usbHubs
    keyboards = $keyboards
    pointingDevices = $pointingDevices
    pnpDevices = $pnpDevices
    systemDrivers = $systemDrivers
    hotfixes = $hotfixes
    security = [ordered]@{
      secureBoot = $secureBoot
      vbsConfigured = @($deviceGuard.SecurityServicesConfigured)
      vbsRunning = @($deviceGuard.SecurityServicesRunning)
      virtualizationBasedSecurityStatus = $deviceGuard.VirtualizationBasedSecurityStatus
    }
  }
  cpu = [ordered]@{
    loadPct = [math]::Round(($cpuLoad -as [double]), 1)
    cores = $cpu.NumberOfCores
    threads = $cpu.NumberOfLogicalProcessors
    maxClockMhz = $cpu.MaxClockSpeed
    logical = $cpuThreads
  }
  gpu = $gpu
  memory = [ordered]@{
    totalMb = $memTotalMb
    usedMb = $memUsedMb
    freeMb = $memFreeMb
    usedPct = [math]::Round(($memUsedMb / [math]::Max($memTotalMb, 1)) * 100, 1)
    sticks = $ramSticks
  }
  disks = $disks
  network = [ordered]@{
    cloudflare = Ping-Target "1.1.1.1"
    chatgpt = Ping-Target "chatgpt.com"
  }
  graphics = [ordered]@{
    mpoDisabled = ($dwm.OverlayTestMode -eq 5)
    overlayTestMode = $dwm.OverlayTestMode
  }
  processes = [ordered]@{
    topMemory = $topMemory
    topCpu = $topCpu
  }
  events = $events
} | ConvertTo-Json -Depth 8 -Compress
`;

const psToolkit = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

function Tool($id, $name, $category, $command, $paths) {
  $found = $null
  $version = $null
  if ($command) {
    $cmd = Get-Command $command -ErrorAction SilentlyContinue
    if ($cmd) { $found = $cmd.Source }
  }
  if (-not $found -and $paths) {
    foreach ($p in $paths) {
      if (Test-Path $p) { $found = $p; break }
    }
  }
  if ($found) {
    try {
      if ($id -eq "nvidia-smi") { $version = (& $found --query-gpu=driver_version --format=csv,noheader 2>$null | Select-Object -First 1) }
      elseif ($id -eq "winget") { $version = (& $found --version 2>$null | Select-Object -First 1) }
      elseif ($id -eq "node") { $version = (& $found --version 2>$null | Select-Object -First 1) }
      elseif ($id -eq "git") { $version = (& $found --version 2>$null | Select-Object -First 1) }
    } catch {}
  }
  [ordered]@{
    id = $id
    name = $name
    category = $category
    available = [bool]$found
    path = $found
    version = $version
  }
}

$tools = @(
  Tool "nvidia-smi" "NVIDIA SMI" "GPU telemetry" "nvidia-smi" @()
  Tool "winget" "Windows Package Manager" "installer" "winget" @()
  Tool "node" "Node.js Runtime" "runtime" "node" @()
  Tool "git" "Git" "distribution" "git" @()
  Tool "y-cruncher" "y-cruncher" "CPU / RAM stress" "y-cruncher" @("$env:USERPROFILE\Downloads\y-cruncher\y-cruncher.exe", "$env:USERPROFILE\Documents\y-cruncher\y-cruncher.exe")
  Tool "memtest86" "MemTest86" "memory test" $null @("$env:USERPROFILE\Downloads\memtest86-usb\imageUSB.exe", "$env:USERPROFILE\Documents\memtest86-usb\imageUSB.exe")
  Tool "furmark" "FurMark" "GPU stress" $null @("$pf\Geeks3D\FurMark2\FurMark_GUI.exe", "$pf86\Geeks3D\FurMark2\FurMark_GUI.exe")
  Tool "occt" "OCCT" "stability suite" $null @("$pf\OCCT\OCCT.exe", "$pf86\OCCT\OCCT.exe")
  Tool "hwinfo" "HWiNFO" "sensor bridge" $null @("$pf\HWiNFO64\HWiNFO64.EXE", "$pf86\HWiNFO64\HWiNFO64.EXE")
  Tool "librehardwaremonitor" "LibreHardwareMonitor" "sensor bridge" $null @("$pf\LibreHardwareMonitor\LibreHardwareMonitor.exe", "$env:USERPROFILE\Downloads\LibreHardwareMonitor\LibreHardwareMonitor.exe")
  Tool "crystaldiskinfo" "CrystalDiskInfo" "storage health" $null @("$pf\CrystalDiskInfo\DiskInfo64.exe", "$pf86\CrystalDiskInfo\DiskInfo64.exe")
  Tool "prime95" "Prime95" "CPU stress" $null @("$pf\Prime95\prime95.exe", "$env:USERPROFILE\Downloads\prime95\prime95.exe")
)

[ordered]@{
  generatedAt = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
  tools = $tools
  available = @($tools | Where-Object { $_.available }).Count
  total = @($tools).Count
} | ConvertTo-Json -Depth 5 -Compress
`;

const cpuBenchScript = `
const crypto = require("crypto");
const start = Date.now();
const duration = 2500;
let iterations = 0;
let digest = Buffer.alloc(32, 1);
while (Date.now() - start < duration) {
  digest = crypto.createHash("sha256").update(digest).update(String(iterations)).digest();
  iterations++;
}
const elapsedMs = Date.now() - start;
process.stdout.write(JSON.stringify({
  generatedAt: new Date().toISOString(),
  elapsedMs,
  iterations,
  score: Math.round(iterations / (elapsedMs / 1000)),
  digest: digest.toString("hex").slice(0, 16)
}));
`;

const memoryBenchScript = `
const size = 128 * 1024 * 1024;
const src = Buffer.alloc(size, 0x7f);
const dst = Buffer.alloc(size);
const start = Date.now();
const duration = 2500;
let bytes = 0;
let checksum = 0;
while (Date.now() - start < duration) {
  src.copy(dst, 0, 0, size);
  checksum = (checksum + dst[bytes % size]) & 0xffff;
  bytes += size;
}
const elapsedMs = Date.now() - start;
const gbps = bytes / (elapsedMs / 1000) / 1024 / 1024 / 1024;
process.stdout.write(JSON.stringify({
  generatedAt: new Date().toISOString(),
  elapsedMs,
  bytes,
  score: Math.round(gbps * 1000),
  gbps: Math.round(gbps * 10) / 10,
  checksum
}));
`;

const cpuStressChildScript = `
const crypto = require("crypto");
let running = true;
let ops = 0;
let digest = Buffer.alloc(32, 7);
process.on("message", (message) => {
  if (message === "stop") running = false;
});
setInterval(() => {
  try {
    process.stdout.write(JSON.stringify({ ops, pid: process.pid }) + "\\n");
  } catch {}
}, 1000).unref();
function burn() {
  const deadline = Date.now() + 80;
  while (running && Date.now() < deadline) {
    digest = crypto.createHash("sha256").update(digest).update(String(ops)).digest();
    ops++;
  }
  if (running) setImmediate(burn);
}
burn();
`;

const memoryStressChildScript = `
const targetMb = Math.max(64, Math.min(Number(process.env.RIGSCOPE_MEMORY_MB || 1024), 12288));
const chunkMb = 64;
const blocks = [];
let running = true;
let cycles = 0;
let checksum = 0;
process.on("message", (message) => {
  if (message === "stop") running = false;
});
function emit() {
  try {
    process.stdout.write(JSON.stringify({
      pid: process.pid,
      targetMb,
      heldMb: blocks.length * chunkMb,
      cycles,
      checksum
    }) + "\\n");
  } catch {}
}
function allocateNext() {
  if (!running) return;
  if (blocks.length * chunkMb < targetMb) {
    const block = Buffer.allocUnsafe(chunkMb * 1024 * 1024);
    for (let i = 0; i < block.length; i += 4096) {
      block[i] = (i + blocks.length + cycles) & 255;
      checksum = (checksum + block[i]) & 0xffff;
    }
    blocks.push(block);
    cycles++;
    emit();
    setTimeout(allocateNext, 20);
    return;
  }
  for (const block of blocks) {
    for (let i = 0; i < block.length; i += 32768) {
      block[i] = (block[i] + 1) & 255;
      checksum = (checksum + block[i]) & 0xffff;
    }
  }
  cycles++;
  emit();
  setTimeout(allocateNext, 180);
}
allocateNext();
`;

const psSensorSweep = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$gpu = $null
try {
  $raw = & nvidia-smi --query-gpu=name,temperature.gpu,utilization.gpu,memory.used,memory.total,power.draw,power.limit --format=csv,noheader,nounits 2>$null
  if ($LASTEXITCODE -eq 0 -and $raw) {
    $p = ($raw | Select-Object -First 1).Split(",") | ForEach-Object { $_.Trim() }
    $gpu = [ordered]@{
      name = $p[0]
      temp = [double]$p[1]
      util = [double]$p[2]
      memUsed = [double]$p[3]
      memTotal = [double]$p[4]
      power = [double]$p[5]
      powerLimit = [double]$p[6]
    }
  }
} catch {}

$cpuLoad = (Get-CimInstance Win32_Processor | Measure-Object LoadPercentage -Average).Average
$os = Get-CimInstance Win32_OperatingSystem
$memTotalMb = [math]::Round($os.TotalVisibleMemorySize / 1024, 0)
$memFreeMb = [math]::Round($os.FreePhysicalMemory / 1024, 0)
$memUsedMb = $memTotalMb - $memFreeMb

[ordered]@{
  generatedAt = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
  score = 100
  cpu = [ordered]@{ loadPct = [math]::Round(($cpuLoad -as [double]), 1) }
  gpu = $gpu
  memory = [ordered]@{
    totalMb = $memTotalMb
    usedMb = $memUsedMb
    usedPct = [math]::Round(($memUsedMb / [math]::Max($memTotalMb, 1)) * 100, 1)
  }
} | ConvertTo-Json -Depth 5 -Compress
`;

function runPowerShell(command, timeout = 12000) {
  return new Promise((resolve, reject) => {
    execFile("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], {
      windowsHide: true,
      timeout,
      maxBuffer: 1024 * 1024 * 5
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${error.message}\n${stderr || ""}`));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

function runCommand(command, args = [], timeout = 8000) {
  return new Promise((resolve) => {
    execFile(command, args, {
      windowsHide: true,
      timeout,
      maxBuffer: 1024 * 1024 * 4
    }, (error, stdout) => {
      resolve(error ? "" : stdout.trim());
    });
  });
}

async function findCommand(name) {
  const lookup = process.platform === "win32" ? "where.exe" : "which";
  const out = await runCommand(lookup, [name], 4000);
  return out.split(/\r?\n/).find(Boolean) || null;
}

async function collectSnapshot() {
  if (process.platform !== "win32") return getPortableSnapshot();
  const out = await runPowerShell(psSnapshot, 45000);
  return JSON.parse(out);
}

function mergeLiveSnapshot(full, live) {
  if (!full || !live) return full || live;
  const memory = {
    ...(full.memory || {}),
    ...(live.memory || {})
  };
  if (Number.isFinite(Number(memory.totalMb)) && Number.isFinite(Number(memory.usedMb))) {
    memory.freeMb = Math.max(0, Math.round(Number(memory.totalMb) - Number(memory.usedMb)));
  }
  return {
    ...full,
    generatedAt: live.generatedAt || new Date().toISOString(),
    cache: {
      mode: "live",
      fullGeneratedAt: full.generatedAt || null,
      liveGeneratedAt: live.generatedAt || null,
      fullAgeMs: snapshotCache.fullAt ? Date.now() - snapshotCache.fullAt : null,
      liveAgeMs: snapshotCache.liveAt ? Date.now() - snapshotCache.liveAt : null
    },
    cpu: {
      ...(full.cpu || {}),
      ...(live.cpu || {})
    },
    gpu: live.gpu ? {
      ...(full.gpu || {}),
      ...live.gpu
    } : full.gpu,
    memory,
    network: live.network ? {
      ...(full.network || {}),
      ...live.network
    } : full.network
  };
}

function readCpuSample() {
  return os.cpus().map((cpu, index) => {
    const times = cpu.times || {};
    const total = Object.values(times).reduce((sum, value) => sum + Number(value || 0), 0);
    return {
      index,
      idle: Number(times.idle || 0),
      total,
      speed: Number(cpu.speed || 0)
    };
  });
}

function getCpuLive(fullCpu = {}) {
  const current = readCpuSample();
  const previous = snapshotCache.cpuSample;
  snapshotCache.cpuSample = current;
  if (!previous || previous.length !== current.length) {
    return {
      ...fullCpu,
      loadPct: Number(fullCpu.loadPct || 0),
      logical: fullCpu.logical || current.map((cpu) => ({
        group: 0,
        thread: cpu.index,
        loadPct: 0,
        frequencyMhz: cpu.speed || fullCpu.maxClockMhz || null
      }))
    };
  }
  const logical = current.map((cpu, index) => {
    const prev = previous[index] || {};
    const totalDelta = Math.max(1, cpu.total - Number(prev.total || 0));
    const idleDelta = Math.max(0, cpu.idle - Number(prev.idle || 0));
    const loadPct = Math.round(Math.max(0, Math.min(100, (1 - idleDelta / totalDelta) * 100)));
    const prior = fullCpu.logical?.[index] || {};
    return {
      ...prior,
      group: prior.group || 0,
      thread: prior.thread ?? index,
      loadPct,
      frequencyMhz: cpu.speed || prior.frequencyMhz || fullCpu.maxClockMhz || null
    };
  });
  const loadPct = Math.round(logical.reduce((sum, cpu) => sum + Number(cpu.loadPct || 0), 0) / Math.max(logical.length, 1));
  return {
    ...fullCpu,
    loadPct,
    logical
  };
}

function getMemoryLive(fullMemory = {}) {
  const totalMb = Math.round(os.totalmem() / 1024 / 1024);
  const freeMb = Math.round(os.freemem() / 1024 / 1024);
  const usedMb = Math.max(0, totalMb - freeMb);
  return {
    ...fullMemory,
    totalMb,
    freeMb,
    usedMb,
    usedPct: Math.round((usedMb / Math.max(totalMb, 1)) * 1000) / 10
  };
}

async function getNvidiaSmiPath() {
  if (snapshotCache.nvidiaSmiChecked) return snapshotCache.nvidiaSmiPath;
  snapshotCache.nvidiaSmiChecked = true;
  snapshotCache.nvidiaSmiPath = await findCommand("nvidia-smi");
  return snapshotCache.nvidiaSmiPath;
}

async function getGpuLive(fullGpu = null) {
  const smi = await getNvidiaSmiPath();
  if (!smi) return fullGpu;
  const raw = await runCommand(smi, ["--query-gpu=name,driver_version,temperature.gpu,utilization.gpu,memory.used,memory.total,power.draw,power.limit,clocks.current.graphics,clocks.current.memory", "--format=csv,noheader,nounits"], 1800);
  const p = raw.split(/\r?\n/)[0]?.split(",").map((value) => value.trim()) || [];
  if (p.length < 10) return fullGpu;
  return {
    ...(fullGpu || {}),
    name: p[0],
    driver: p[1],
    temp: Number(p[2]),
    util: Number(p[3]),
    memUsed: Number(p[4]),
    memTotal: Number(p[5]),
    power: Number(p[6]),
    powerLimit: Number(p[7]),
    graphicsClock: Number(p[8]),
    memoryClock: Number(p[9])
  };
}

function parsePingMs(output) {
  const text = String(output || "");
  const average = text.match(/Average\s*=\s*(\d+)/i);
  const time = text.match(/time[=<]\s*(\d+)/i);
  const replyTime = text.match(/=\s*(\d+)\D+TTL/i);
  const msValues = Array.from(text.matchAll(/(\d+)\s*ms/gi));
  const value = Number(average?.[1] || time?.[1] || replyTime?.[1] || msValues.at(-1)?.[1]);
  return Number.isFinite(value) ? value : null;
}

async function pingLive(target) {
  const windowsPing = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "ping.exe");
  const command = process.platform === "win32" && fs.existsSync(windowsPing) ? windowsPing : "ping";
  const args = process.platform === "win32" ? ["-n", "1", "-w", "900", target] : ["-c", "1", "-W", "1", target];
  const out = await runCommand(command, args, 1500);
  const ms = parsePingMs(out);
  return { target, ok: Number.isFinite(ms), ms };
}

async function getNetworkLive(fullNetwork = null) {
  const ageMs = snapshotCache.networkAt ? Date.now() - snapshotCache.networkAt : Infinity;
  if (!snapshotCache.networkPromise && ageMs > NETWORK_LIVE_TTL_MS) {
    snapshotCache.networkPromise = Promise.all([pingLive("1.1.1.1"), pingLive("chatgpt.com")])
      .then(([cloudflare, chatgpt]) => {
        snapshotCache.network = { cloudflare, chatgpt };
        snapshotCache.networkAt = Date.now();
        return snapshotCache.network;
      })
      .finally(() => {
        snapshotCache.networkPromise = null;
      });
  }
  if (!snapshotCache.network && snapshotCache.networkPromise) await snapshotCache.networkPromise;
  return snapshotCache.network || fullNetwork;
}

async function collectLiveSnapshot() {
  const full = snapshotCache.full || {};
  const [gpu, network] = await Promise.all([
    getGpuLive(full.gpu),
    getNetworkLive(full.network)
  ]);
  return {
    generatedAt: new Date().toISOString(),
    score: 100,
    cpu: getCpuLive(full.cpu),
    gpu,
    memory: getMemoryLive(full.memory),
    network
  };
}

function startFullSnapshotRefresh() {
  if (snapshotCache.fullPromise) return snapshotCache.fullPromise;
  snapshotCache.fullPromise = collectSnapshot()
    .then((snapshot) => {
      snapshotCache.full = { ...snapshot, cache: { mode: "full", fullGeneratedAt: snapshot.generatedAt || null } };
      snapshotCache.fullAt = Date.now();
      return snapshotCache.full;
    })
    .finally(() => {
      snapshotCache.fullPromise = null;
    });
  return snapshotCache.fullPromise;
}

async function getSnapshot(options = {}) {
  const force = Boolean(options.force);
  const ageMs = snapshotCache.fullAt ? Date.now() - snapshotCache.fullAt : Infinity;
  if (force || !snapshotCache.full) return startFullSnapshotRefresh();
  if (ageMs > FULL_SNAPSHOT_TTL_MS) {
    startFullSnapshotRefresh().catch(console.error);
  }
  return mergeLiveSnapshot(snapshotCache.full, snapshotCache.live);
}

async function getLiveSnapshot() {
  if (!snapshotCache.full) return getSnapshot();
  const ageMs = snapshotCache.liveAt ? Date.now() - snapshotCache.liveAt : Infinity;
  if (!snapshotCache.livePromise && ageMs > LIVE_SNAPSHOT_TTL_MS) {
    snapshotCache.livePromise = collectLiveSnapshot()
      .then((live) => {
        snapshotCache.live = live;
        snapshotCache.liveAt = Date.now();
        return live;
      })
      .finally(() => {
        snapshotCache.livePromise = null;
      });
  }
  if (!snapshotCache.live || ageMs > LIVE_SNAPSHOT_TTL_MS) await snapshotCache.livePromise;
  return mergeLiveSnapshot(snapshotCache.full, snapshotCache.live);
}

async function getToolkit() {
  return getNativeToolkit();
}

function getNativeBridges() {
  const bridges = detectNativeBridges();
  const available = bridges.tools.filter((tool) => tool.available).length;
  return {
    ...bridges,
    available,
    total: bridges.tools.length
  };
}

function getNativeToolkit() {
  const bridges = getNativeBridges();
  return {
    generatedAt: bridges.generatedAt,
    platform: bridges.platform,
    safeMode: bridges.safeMode,
    tools: bridges.tools.map((tool) => ({
      id: tool.id,
      name: tool.name,
      vendor: tool.vendor,
      category: tool.category,
      available: tool.available,
      supported: tool.supported,
      status: tool.status,
      path: tool.executable?.path || null,
      version: null,
      capabilities: tool.capabilities,
      commands: tool.commands,
      notes: tool.notes
    })),
    available: bridges.available,
    total: bridges.total
  };
}

function round(value, digits = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const m = 10 ** digits;
  return Math.round(n * m) / m;
}

function parseOsRelease() {
  if (process.platform !== "linux") return {};
  try {
    const lines = fs.readFileSync("/etc/os-release", "utf8").split(/\r?\n/);
    return Object.fromEntries(lines.filter((line) => line.includes("=")).map((line) => {
      const [key, ...rest] = line.split("=");
      return [key, rest.join("=").replace(/^"|"$/g, "")];
    }));
  } catch {
    return {};
  }
}

async function getGpuPortable() {
  const smi = await findCommand("nvidia-smi");
  if (smi) {
    const raw = await runCommand(smi, ["--query-gpu=name,driver_version,temperature.gpu,utilization.gpu,memory.used,memory.total,power.draw,power.limit,clocks.current.graphics,clocks.current.memory", "--format=csv,noheader,nounits"], 8000);
    const p = raw.split(/\r?\n/)[0]?.split(",").map((v) => v.trim()) || [];
    if (p.length >= 10) {
      return {
        name: p[0],
        driver: p[1],
        temp: round(p[2]),
        util: round(p[3]),
        memUsed: round(p[4]),
        memTotal: round(p[5]),
        power: round(p[6]),
        powerLimit: round(p[7]),
        graphicsClock: round(p[8]),
        memoryClock: round(p[9])
      };
    }
  }
  if (process.platform === "darwin") {
    const out = await runCommand("system_profiler", ["SPDisplaysDataType"], 10000);
    const name = out.match(/Chipset Model:\s*(.+)/)?.[1]?.trim();
    const vram = out.match(/VRAM.*:\s*(.+)/)?.[1]?.trim();
    return name ? { name, driver: "macOS graphics stack", memTotal: vram || null } : null;
  }
  const lspci = await findCommand("lspci");
  if (lspci) {
    const out = await runCommand(lspci, [], 6000);
    const line = out.split(/\r?\n/).find((item) => /vga|3d|display/i.test(item));
    if (line) return { name: line.replace(/^.*?:\s*/, ""), driver: "kernel driver", util: null };
  }
  return null;
}

async function getDisksPortable() {
  const out = await runCommand("df", ["-kP"], 8000);
  return out.split(/\r?\n/).slice(1).map((line) => line.trim().split(/\s+/)).filter((p) => p.length >= 6).map((p) => {
    const totalGb = Number(p[1]) / 1024 / 1024;
    const freeGb = Number(p[3]) / 1024 / 1024;
    return {
      drive: p[5],
      name: p[5],
      label: p[0],
      fileSystem: p[0],
      totalGb: round(totalGb),
      freeGb: round(freeGb),
      usedPct: round((1 - freeGb / Math.max(totalGb, 0.1)) * 100)
    };
  }).slice(0, 16);
}

async function getProcessesPortable() {
  const out = await runCommand("ps", ["-axo", "pid,pcpu,rss,comm"], 8000);
  const rows = out.split(/\r?\n/).slice(1).map((line) => {
    const m = line.trim().match(/^(\d+)\s+([\d.]+)\s+(\d+)\s+(.+)$/);
    if (!m) return null;
    return {
      id: Number(m[1]),
      cpu: round(m[2]),
      memoryMb: round(Number(m[3]) / 1024),
      name: path.basename(m[4])
    };
  }).filter(Boolean);
  return {
    topCpu: [...rows].sort((a, b) => b.cpu - a.cpu).slice(0, 8),
    topMemory: [...rows].sort((a, b) => b.memoryMb - a.memoryMb).slice(0, 8)
  };
}

async function pingPortable(host) {
  const args = process.platform === "darwin" ? ["-c", "1", "-W", "2000", host] : ["-c", "1", "-W", "2", host];
  const out = await runCommand("ping", args, 5000);
  const ms = out.match(/time[=<]([\d.]+)\s*ms/)?.[1];
  return { ok: Boolean(ms), ms: ms ? round(ms) : null };
}

async function getPortableSnapshot() {
  const cpus = os.cpus();
  const cpu = cpus[0] || {};
  const memTotalMb = round(os.totalmem() / 1024 / 1024, 0);
  const memFreeMb = round(os.freemem() / 1024 / 1024, 0);
  const memUsedMb = memTotalMb - memFreeMb;
  const osRelease = parseOsRelease();
  const [gpu, disks, processes, cloudflare, chatgpt] = await Promise.all([
    getGpuPortable(),
    getDisksPortable(),
    getProcessesPortable(),
    pingPortable("1.1.1.1"),
    pingPortable("chatgpt.com")
  ]);
  const caption = process.platform === "darwin" ? `macOS ${os.release()}` : osRelease.PRETTY_NAME || `${os.type()} ${os.release()}`;
  const loadPct = round(Math.min(100, (os.loadavg()[0] / Math.max(cpus.length, 1)) * 100));
  const logical = cpus.map((item, index) => ({
    group: 0,
    thread: index,
    loadPct,
    performancePct: null,
    frequencyMhz: item.speed,
    userPct: null,
    kernelPct: null
  }));
  const inventory = {
    os: { caption, version: os.release(), build: os.release(), architecture: os.arch(), locale: Intl.DateTimeFormat().resolvedOptions().locale, bootTime: new Date(Date.now() - os.uptime() * 1000).toISOString(), installDate: null, windowsDirectory: null },
    system: { manufacturer: os.type(), model: os.hostname(), type: os.arch(), domain: null, user: os.userInfo().username, secureBoot: null, hypervisorPresent: null },
    board: { manufacturer: "-", product: "-", version: "-", serial: null },
    bios: { vendor: "-", version: "-", releaseDate: null, serial: null, mode: "-" },
    cpu: { name: cpu.model || os.arch(), manufacturer: cpu.model?.split(" ")[0] || "-", socket: "-", architecture: os.arch(), family: "-", cores: cpus.length, threads: cpus.length, currentClockMhz: cpu.speed, maxClockMhz: cpu.speed, externalClockMhz: null, l2Kb: null, l3Kb: null, virtualization: null, processorId: null },
    memory: { totalGb: round(os.totalmem() / 1024 / 1024 / 1024), modules: [] },
    gpus: gpu ? [{ name: gpu.name, vramMb: gpu.memTotal, videoProcessor: gpu.name, adapterCompatibility: "-", driverVersion: gpu.driver, driverDate: "-", currentResolution: "-", currentRefreshRate: "-" }] : [],
    gpu: gpu || {},
    physicalDisks: disks.map((disk) => ({ model: disk.label, sizeGb: disk.totalGb, health: "unknown", status: "unknown", operational: "mounted", busType: "-", interface: "-", firmware: "-", serial: null, partitions: "-" })),
    volumes: disks,
    networkAdapters: [],
    monitors: [],
    soundDevices: [],
    usbControllers: [],
    usbHubs: [],
    keyboards: [],
    pointingDevices: [],
    pnpDevices: [],
    systemDrivers: [],
    hotfixes: [],
    security: {}
  };
  return {
    generatedAt: new Date().toISOString().slice(0, 19).replace("T", " "),
    machine: { os: caption, build: os.release(), cpu: inventory.cpu.name, gpu: gpu?.name || "-", uptimeHours: round(os.uptime() / 3600, 1) },
    inventory,
    cpu: { loadPct, cores: cpus.length, threads: cpus.length, maxClockMhz: cpu.speed, logical },
    gpu,
    memory: { totalMb: memTotalMb, usedMb: memUsedMb, freeMb: memFreeMb, usedPct: round((memUsedMb / Math.max(memTotalMb, 1)) * 100), sticks: [] },
    disks,
    network: { cloudflare, chatgpt },
    graphics: { mpoDisabled: null, overlayTestMode: null },
    processes,
    events: []
  };
}

async function getPortableToolkit() {
  const defs = [
    ["nvidia-smi", "NVIDIA SMI", "GPU telemetry", "nvidia-smi"],
    ["node", "Node.js Runtime", "runtime", "node"],
    ["git", "Git", "distribution", "git"],
    ["y-cruncher", "y-cruncher", "CPU / RAM stress", "y-cruncher"],
    ["memtest86", "MemTest86", "memory test", "memtest86"],
    ["furmark", "FurMark", "GPU stress", "furmark"],
    ["occt", "OCCT", "stability suite", "occt"],
    ["hwinfo", "HWiNFO", "sensor bridge", "hwinfo"],
    ["librehardwaremonitor", "LibreHardwareMonitor", "sensor bridge", "LibreHardwareMonitor"],
    ["smartctl", "smartmontools", "storage health", "smartctl"],
    ["prime95", "Prime95 / mprime", "CPU stress", process.platform === "darwin" || process.platform === "linux" ? "mprime" : "prime95"]
  ];
  const tools = await Promise.all(defs.map(async ([id, name, category, command]) => {
    const found = await findCommand(command);
    let version = null;
    if (found && ["node", "git"].includes(id)) version = (await runCommand(found, ["--version"], 4000)).split(/\r?\n/)[0] || null;
    return { id, name, category, available: Boolean(found), path: found, version };
  }));
  return {
    generatedAt: new Date().toISOString(),
    tools,
    available: tools.filter((tool) => tool.available).length,
    total: tools.length
  };
}

function runCpuBenchmark() {
  return runNodeBenchmark(cpuBenchScript, 6000);
}

function runMemoryBenchmark() {
  return runNodeBenchmark(memoryBenchScript, 7000);
}

function runNodeBenchmark(script, timeout) {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, ["-e", script], {
      windowsHide: true,
      timeout,
      maxBuffer: 1024 * 256,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${error.message}\n${stderr || ""}`));
        return;
      }
      const output = stdout.trim();
      if (!output) {
        reject(new Error(`Benchmark worker produced no JSON output.${stderr ? `\n${stderr}` : ""}`));
        return;
      }
      try {
        resolve(JSON.parse(output));
      } catch (parseError) {
        reject(new Error(`Benchmark worker returned invalid JSON: ${parseError.message}\n${output.slice(0, 500)}`));
      }
    });
  });
}

const cpuStress = {
  active: false,
  startedAt: 0,
  stoppedAt: 0,
  durationMs: 0,
  workers: [],
  ops: 0,
  finalOps: 0,
  lastOps: 0,
  lastRate: 0,
  timer: null
};

const memoryStress = {
  active: false,
  startedAt: 0,
  stoppedAt: 0,
  durationMs: 0,
  targetMb: 0,
  child: null,
  heldMb: 0,
  lastHeldMb: 0,
  peakHeldMb: 0,
  cycles: 0,
  checksum: 0,
  timer: null
};

function safeSendChildMessage(child, message) {
  if (!child || child.exitCode !== null || child.signalCode !== null || !child.connected) return false;
  try {
    child.send(message, () => {});
    return true;
  } catch {
    return false;
  }
}

function safeKillChild(child) {
  if (!child || child.killed || child.exitCode !== null || child.signalCode !== null) return;
  try { child.kill(); } catch {}
}

function stopCpuStress(reason = "stopped") {
  if (!cpuStress.active && !cpuStress.workers.length) {
    return cpuStressStatus(reason);
  }
  cpuStress.active = false;
  cpuStress.stoppedAt = Date.now();
  clearTimeout(cpuStress.timer);
  cpuStress.finalOps = Math.max(cpuStress.finalOps, cpuStress.ops);
  const workers = cpuStress.workers.splice(0);
  workers.forEach((child) => {
    safeSendChildMessage(child, "stop");
    setTimeout(() => {
      safeKillChild(child);
    }, 500).unref();
  });
  return cpuStressStatus(reason);
}

function startCpuStress({ durationSec = 60, workers } = {}) {
  stopCpuStress("restarted");
  const logical = os.cpus().length || 4;
  const workerCount = Math.max(1, Math.min(Number(workers) || logical, logical));
  cpuStress.active = true;
  cpuStress.startedAt = Date.now();
  cpuStress.stoppedAt = 0;
  cpuStress.durationMs = Math.max(10, Math.min(Number(durationSec) || 60, 1800)) * 1000;
  cpuStress.ops = 0;
  cpuStress.finalOps = 0;
  cpuStress.lastOps = 0;
  cpuStress.lastRate = 0;
  cpuStress.workers = Array.from({ length: workerCount }, () => {
    const child = spawn(process.execPath, ["-e", cpuStressChildScript], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore", "ipc"],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }
    });
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      chunk.split(/\r?\n/).filter(Boolean).forEach((line) => {
        try {
          const payload = JSON.parse(line);
          child.latestOps = Number(payload.ops || 0);
          cpuStress.ops = cpuStress.workers.reduce((sum, item) => sum + (item.latestOps || 0), 0);
        } catch {}
      });
    });
    child.on("exit", () => {
      child.latestOps = 0;
    });
    child.on("error", () => {
      child.latestOps = 0;
    });
    return child;
  });
  cpuStress.timer = setTimeout(() => stopCpuStress("completed"), cpuStress.durationMs);
  cpuStress.timer.unref();
  return cpuStressStatus("started");
}

function cpuStressStatus(reason = "status") {
  const endAt = cpuStress.active ? Date.now() : cpuStress.stoppedAt || Date.now();
  const elapsedMs = cpuStress.startedAt ? endAt - cpuStress.startedAt : 0;
  const rate = Math.max(0, cpuStress.ops - cpuStress.lastOps);
  cpuStress.lastRate = rate;
  cpuStress.lastOps = cpuStress.ops;
  return {
    active: cpuStress.active,
    reason,
    startedAt: cpuStress.startedAt ? new Date(cpuStress.startedAt).toISOString() : null,
    elapsedMs,
    durationMs: cpuStress.durationMs,
    workers: cpuStress.workers.length,
    ops: Math.max(cpuStress.ops, cpuStress.finalOps),
    opsPerSec: rate
  };
}

function stopMemoryStress(reason = "stopped") {
  if (!memoryStress.active && !memoryStress.child) {
    return memoryStressStatus(reason);
  }
  memoryStress.active = false;
  memoryStress.stoppedAt = Date.now();
  clearTimeout(memoryStress.timer);
  const child = memoryStress.child;
  memoryStress.child = null;
  memoryStress.lastHeldMb = Math.max(memoryStress.lastHeldMb, memoryStress.heldMb);
  memoryStress.peakHeldMb = Math.max(memoryStress.peakHeldMb, memoryStress.heldMb);
  memoryStress.heldMb = 0;
  if (child) {
    safeSendChildMessage(child, "stop");
    setTimeout(() => {
      safeKillChild(child);
    }, 500).unref();
  }
  return memoryStressStatus(reason);
}

function startMemoryStress({ durationSec = 60, targetMb } = {}) {
  stopMemoryStress("restarted");
  const totalMb = Math.round(os.totalmem() / 1024 / 1024);
  const safeDefault = Math.min(4096, Math.max(512, Math.round(totalMb * 0.12)));
  const requested = Number(targetMb) || safeDefault;
  const capped = Math.max(64, Math.min(requested, Math.round(totalMb * 0.35), 12288));
  memoryStress.active = true;
  memoryStress.startedAt = Date.now();
  memoryStress.stoppedAt = 0;
  memoryStress.durationMs = Math.max(10, Math.min(Number(durationSec) || 60, 1800)) * 1000;
  memoryStress.targetMb = capped;
  memoryStress.heldMb = 0;
  memoryStress.lastHeldMb = 0;
  memoryStress.peakHeldMb = 0;
  memoryStress.cycles = 0;
  memoryStress.checksum = 0;
  const child = spawn(process.execPath, ["-e", memoryStressChildScript], {
    windowsHide: true,
    stdio: ["ignore", "pipe", "ignore", "ipc"],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", RIGSCOPE_MEMORY_MB: String(capped) }
  });
  memoryStress.child = child;
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    chunk.split(/\r?\n/).filter(Boolean).forEach((line) => {
      try {
        const payload = JSON.parse(line);
        memoryStress.heldMb = Number(payload.heldMb || memoryStress.heldMb);
        memoryStress.lastHeldMb = memoryStress.heldMb;
        memoryStress.peakHeldMb = Math.max(memoryStress.peakHeldMb, memoryStress.heldMb);
        memoryStress.cycles = Number(payload.cycles || memoryStress.cycles);
        memoryStress.checksum = Number(payload.checksum || memoryStress.checksum);
      } catch {}
    });
  });
  child.on("exit", () => {
    memoryStress.stoppedAt = memoryStress.stoppedAt || Date.now();
    memoryStress.lastHeldMb = Math.max(memoryStress.lastHeldMb, memoryStress.heldMb);
    memoryStress.peakHeldMb = Math.max(memoryStress.peakHeldMb, memoryStress.heldMb);
    memoryStress.heldMb = 0;
    if (memoryStress.active) memoryStress.active = false;
    if (memoryStress.child === child) memoryStress.child = null;
  });
  child.on("error", () => {
    memoryStress.stoppedAt = memoryStress.stoppedAt || Date.now();
    memoryStress.lastHeldMb = Math.max(memoryStress.lastHeldMb, memoryStress.heldMb);
    memoryStress.peakHeldMb = Math.max(memoryStress.peakHeldMb, memoryStress.heldMb);
    memoryStress.heldMb = 0;
    if (memoryStress.active) memoryStress.active = false;
    if (memoryStress.child === child) memoryStress.child = null;
  });
  memoryStress.timer = setTimeout(() => stopMemoryStress("completed"), memoryStress.durationMs);
  memoryStress.timer.unref();
  return memoryStressStatus("started");
}

function memoryStressStatus(reason = "status") {
  const endAt = memoryStress.active ? Date.now() : memoryStress.stoppedAt || Date.now();
  const elapsedMs = memoryStress.startedAt ? endAt - memoryStress.startedAt : 0;
  return {
    active: memoryStress.active,
    reason,
    startedAt: memoryStress.startedAt ? new Date(memoryStress.startedAt).toISOString() : null,
    elapsedMs,
    durationMs: memoryStress.durationMs,
    targetMb: memoryStress.targetMb,
    heldMb: memoryStress.active ? memoryStress.heldMb : 0,
    lastHeldMb: memoryStress.lastHeldMb,
    peakHeldMb: memoryStress.peakHeldMb,
    cycles: memoryStress.cycles,
    checksum: memoryStress.checksum
  };
}

async function getPortableSensorSweep() {
  const snapshot = await getPortableSnapshot();
  return {
    generatedAt: new Date().toISOString(),
    score: 100,
    cpu: { loadPct: snapshot.cpu?.loadPct ?? null },
    gpu: snapshot.gpu || null,
    memory: snapshot.memory || null
  };
}

async function getSensorSweep() {
  if (process.platform !== "win32") return getPortableSensorSweep();
  const out = await runPowerShell(psSensorSweep, 12000);
  return JSON.parse(out);
}

function getStressStatus(reason = "status") {
  const cpu = cpuStressStatus(reason);
  const memory = memoryStressStatus(reason);
  const active = cpuStress.active || memoryStress.active;
  const activeElapsedMs = Math.max(cpu.active ? cpu.elapsedMs || 0 : 0, memory.active ? memory.elapsedMs || 0 : 0);
  const activeDurationMs = Math.max(cpu.active ? cpu.durationMs || 0 : 0, memory.active ? memory.durationMs || 0 : 0);
  return {
    generatedAt: new Date().toISOString(),
    reason,
    active,
    elapsedMs: active ? activeElapsedMs : 0,
    durationMs: active ? activeDurationMs : 0,
    engines: {
      cpu,
      memory,
      gpu: {
        active: false,
        engine: "browser-webgl",
        reason: "controlled by the UI render loop"
      }
    }
  };
}

async function readLocalCommunity() {
  try {
    const raw = await fs.promises.readFile(COMMUNITY_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.profiles) ? dedupeProfiles(parsed.profiles) : [];
  } catch {
    return [];
  }
}

async function writeLocalCommunity(profiles) {
  await fs.promises.mkdir(COMMUNITY_DIR, { recursive: true });
  await fs.promises.writeFile(COMMUNITY_FILE, JSON.stringify({ profiles: dedupeProfiles(profiles) }, null, 2));
}

function isAllowedCommunityUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && [
      "raw.githubusercontent.com",
      "gist.githubusercontent.com"
    ].includes(url.hostname);
  } catch {
    return false;
  }
}

function isAllowedScoreboardUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname);
  } catch {
    return false;
  }
}

async function readScoreboardCommunity() {
  if (!SCOREBOARD_URL || !isAllowedScoreboardUrl(SCOREBOARD_URL) || typeof fetch !== "function") {
    return { profiles: [], status: SCOREBOARD_URL ? "invalid scoreboard url" : "not configured" };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${SCOREBOARD_URL}/api/v1/leaderboard?limit=100`, { signal: controller.signal, cache: "no-store" });
    if (!response.ok) return { profiles: [], status: `scoreboard ${response.status}` };
    const payload = await response.json();
    return { profiles: dedupeProfiles((payload.profiles || []).map((profile) => ({ ...profile, source: "scoreboard" }))), status: "scoreboard online" };
  } catch (error) {
    return { profiles: [], status: error.name === "AbortError" ? "scoreboard timeout" : "scoreboard failed" };
  } finally {
    clearTimeout(timer);
  }
}

async function readRemoteCommunity() {
  if (!COMMUNITY_FEED_URL || !isAllowedCommunityUrl(COMMUNITY_FEED_URL) || typeof fetch !== "function") {
    return { profiles: [], status: COMMUNITY_FEED_URL ? "invalid feed url" : "not configured" };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(COMMUNITY_FEED_URL, { signal: controller.signal, cache: "no-store" });
    if (!response.ok) return { profiles: [], status: `feed ${response.status}` };
    const payload = await response.json();
    const profiles = Array.isArray(payload) ? payload : payload.profiles;
    return { profiles: dedupeProfiles((profiles || []).map((profile) => ({ ...profile, source: "github" }))), status: "online" };
  } catch (error) {
    return { profiles: [], status: error.name === "AbortError" ? "feed timeout" : "feed failed" };
  } finally {
    clearTimeout(timer);
  }
}

async function publishCommunityProfile(profile) {
  const publicProfile = sanitizeProfile({ ...profile, source: "scoreboard" });

  if (SCOREBOARD_URL && isAllowedScoreboardUrl(SCOREBOARD_URL) && typeof fetch === "function") {
    try {
      const challengeResponse = await fetch(`${SCOREBOARD_URL}/api/v1/challenge`, { method: "POST" });
      if (!challengeResponse.ok) throw new Error(`challenge ${challengeResponse.status}`);
      const challenge = await challengeResponse.json();
      const submitResponse = await fetch(`${SCOREBOARD_URL}/api/v1/submissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nonce: challenge.nonce, profile: publicProfile })
      });
      if (submitResponse.ok) {
        const submitted = await submitResponse.json();
        return { profile: submitted.profile || publicProfile, status: "published online", github: "scoreboard" };
      }
      return await saveOfflineCommunityProfile(publicProfile, `scoreboard ${submitResponse.status}`);
    } catch (error) {
      return await saveOfflineCommunityProfile(publicProfile, `scoreboard failed: ${safeText(error.message)}`);
    }
  }

  const localProfile = sanitizeProfile({ ...publicProfile, source: "local" });
  const local = await readLocalCommunity();
  const profiles = dedupeProfiles([localProfile, ...local.filter((item) => item.id !== localProfile.id)]);
  await writeLocalCommunity(profiles);

  if (!GITHUB_GIST_ID || !GITHUB_TOKEN || typeof fetch !== "function") {
    return { profile: localProfile, status: "saved offline", github: "not configured" };
  }

  const gistProfiles = dedupeProfiles(profiles.map((item) => ({ ...item, source: "github" })));
  const response = await fetch(`https://api.github.com/gists/${encodeURIComponent(GITHUB_GIST_ID)}`, {
    method: "PATCH",
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${GITHUB_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "RigScope"
    },
    body: JSON.stringify({
      files: {
        [GIST_FILENAME]: {
          content: JSON.stringify({ profiles: gistProfiles }, null, 2)
        }
      }
    })
  });
  if (!response.ok) {
    return { profile: localProfile, status: "saved offline", github: `gist ${response.status}` };
  }
  return { profile: localProfile, status: "saved offline and published", github: "published" };
}

async function saveOfflineCommunityProfile(profile, reason) {
  const localProfile = sanitizeProfile({ ...profile, source: "local" });
  const local = await readLocalCommunity();
  const profiles = dedupeProfiles([localProfile, ...local.filter((item) => item.id !== localProfile.id)]);
  await writeLocalCommunity(profiles);
  return { profile: localProfile, status: "saved offline", github: reason };
}

async function getCommunity() {
  const [local, scoreboard, remote] = await Promise.all([readLocalCommunity(), readScoreboardCommunity(), readRemoteCommunity()]);
  const localProfiles = scoreboard.status === "scoreboard online" ? [] : local;
  return {
    generatedAt: new Date().toISOString(),
    mode: SCOREBOARD_URL ? "scoreboard" : COMMUNITY_FEED_URL ? "github-feed" : "local",
    publishing: SCOREBOARD_URL ? "scoreboard" : GITHUB_GIST_ID && GITHUB_TOKEN ? "github-gist" : "local-only",
    status: scoreboard.status !== "not configured" ? scoreboard.status : remote.status,
    profiles: dedupeProfiles([...localProfiles, ...scoreboard.profiles, ...remote.profiles])
  };
}

async function getStressCapabilities() {
  const bridges = getNativeBridges();
  const byId = Object.fromEntries(bridges.tools.map((tool) => [tool.id, tool]));
  return {
    generatedAt: new Date().toISOString(),
    platform: bridges.platform,
    builtIn: [
      { id: "cpu-node-workers", target: "cpu", available: true, safe: true, description: "Multi-process SHA-256 CPU load using local Node.js workers." },
      { id: "memory-node-allocator", target: "memory", available: true, safe: true, description: "Bounded server-side RAM allocator with page touching and checksum loop." },
      { id: "gpu-browser-webgl", target: "gpu", available: true, safe: true, description: "Browser/Electron WebGL render loop, controlled by the visible Lab canvas." },
      { id: "sensor-sweep", target: "sensors", available: true, safe: true, description: "Cross-platform sensor snapshot with Windows PowerShell or portable OS commands." }
    ],
    native: ["occt", "furmark", "prime95", "y-cruncher", "memtest86", "hwinfo", "librehardwaremonitor", "lm-sensors", "powermetrics", "nvidia-smi"]
      .map((id) => byId[id])
      .filter(Boolean)
      .map((tool) => ({
        id: tool.id,
        name: tool.name,
        category: tool.category,
        available: tool.available,
        supported: tool.supported,
        path: tool.executable?.path || null,
        capabilities: tool.capabilities,
        commands: tool.commands
      }))
  };
}

async function startStressSession(options = {}) {
  const durationSec = Number(options.durationSec) || 60;
  const result = {
    generatedAt: new Date().toISOString(),
    durationSec,
    started: {}
  };
  if (options.cpu) result.started.cpu = startCpuStress({ durationSec, workers: options.workers });
  if (options.memory) result.started.memory = startMemoryStress({ durationSec, targetMb: options.targetMb });
  result.status = getStressStatus("started");
  return result;
}

function stopStressSession(reason = "stopped") {
  const cpu = stopCpuStress(reason);
  const memory = stopMemoryStress(reason);
  return {
    generatedAt: new Date().toISOString(),
    reason,
    stopped: { cpu, memory },
    status: getStressStatus(reason)
  };
}

function openUrl(url, appMode = false) {
  const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  if (appMode && fs.existsSync(edge)) {
    spawn(edge, [`--app=${url}`], { detached: true, stdio: "ignore" }).unref();
    return;
  }
  if (appMode && fs.existsSync(chrome)) {
    spawn(chrome, [`--app=${url}`], { detached: true, stdio: "ignore" }).unref();
    return;
  }
  spawn("cmd.exe", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
}

const serveStatic = createStaticHandler({ publicDir: PUBLIC, port: PORT });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (!guardLocalWrite(req, res, { port: PORT, sendJson })) return;

  if (url.pathname === "/api/health") {
    sendJson(res, 200, {
      ok: true,
      app: "RigScope",
      pid: process.pid,
      version: require("./package.json").version,
      generatedAt: new Date().toISOString()
    });
    return;
  }
  if (url.pathname === "/api/updates/status") {
    try {
      sendJson(res, 200, updateController.status());
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }
  if (url.pathname === "/api/updates/check" && req.method === "POST") {
    try {
      sendJson(res, 200, await updateController.check());
    } catch (error) {
      sendJson(res, error.code === "UPDATES_UNAVAILABLE" ? 409 : 500, { error: error.message });
    }
    return;
  }
  if (url.pathname === "/api/updates/download" && req.method === "POST") {
    try {
      sendJson(res, 200, await updateController.download());
    } catch (error) {
      sendJson(res, error.code === "UPDATES_UNAVAILABLE" ? 409 : 500, { error: error.message });
    }
    return;
  }
  if (url.pathname === "/api/updates/install" && req.method === "POST") {
    try {
      sendJson(res, 200, updateController.install());
    } catch (error) {
      sendJson(res, error.code === "UPDATES_UNAVAILABLE" || error.code === "UPDATE_NOT_DOWNLOADED" ? 409 : 500, { error: error.message });
    }
    return;
  }
  if (url.pathname === "/api/snapshot") {
    try {
      sendJson(res, 200, await getSnapshot());
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }
  if (url.pathname === "/api/live") {
    try {
      sendJson(res, 200, await getLiveSnapshot());
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }
  if (url.pathname === "/api/toolkit") {
    try {
      sendJson(res, 200, await getToolkit());
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }
  if (url.pathname === "/api/bridges") {
    try {
      sendJson(res, 200, getNativeBridges());
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }
  if (url.pathname === "/api/bench/cpu" && req.method === "POST") {
    try {
      sendJson(res, 200, await runCpuBenchmark());
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }
  if (url.pathname === "/api/bench/memory" && req.method === "POST") {
    try {
      sendJson(res, 200, await runMemoryBenchmark());
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }
  if (url.pathname === "/api/sensors/quick" && req.method === "POST") {
    try {
      sendJson(res, 200, await getSensorSweep());
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }
  if (url.pathname === "/api/stress/capabilities") {
    try {
      sendJson(res, 200, await getStressCapabilities());
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }
  if (url.pathname === "/api/stress/start" && req.method === "POST") {
    try {
      sendJson(res, 200, await startStressSession(await readJsonBody(req)));
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }
  if (url.pathname === "/api/stress/stop" && req.method === "POST") {
    try {
      sendJson(res, 200, stopStressSession("stopped"));
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }
  if (url.pathname === "/api/stress/status") {
    sendJson(res, 200, getStressStatus());
    return;
  }
  if (url.pathname === "/api/native-runners") {
    try {
      sendJson(res, 200, {
        generatedAt: new Date().toISOString(),
        acknowledgement: nativeRunners.ACK,
        profiles: nativeRunners.getProfiles(),
        status: nativeRunners.getStatus()
      });
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }
  if (url.pathname === "/api/native-runners/start" && req.method === "POST") {
    try {
      sendJson(res, 200, nativeRunners.startProfile(await readJsonBody(req)));
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }
  if (url.pathname === "/api/native-runners/stop" && req.method === "POST") {
    try {
      sendJson(res, 200, nativeRunners.stopProfile("stopped"));
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }
  if (url.pathname === "/api/native-runners/status") {
    sendJson(res, 200, nativeRunners.getStatus());
    return;
  }
  if (url.pathname === "/api/community") {
    try {
      sendJson(res, 200, await getCommunity());
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }
  if (url.pathname === "/api/community/profile" && req.method === "POST") {
    try {
      sendJson(res, 200, await publishCommunityProfile(await readJsonBody(req)));
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }
  if (url.pathname === "/api/stress/cpu/start" && req.method === "POST") {
    try {
      sendJson(res, 200, startCpuStress(await readJsonBody(req)));
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }
  if (url.pathname === "/api/stress/cpu/stop" && req.method === "POST") {
    try {
      sendJson(res, 200, stopCpuStress("stopped"));
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }
  if (url.pathname === "/api/stress/cpu/status") {
    sendJson(res, 200, cpuStressStatus());
    return;
  }
  if (url.pathname === "/api/export") {
    try {
      const snapshot = await getSnapshot({ force: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      sendDownload(res, `rigscope-report-${stamp}.json`, snapshot);
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }
  serveStatic(req, res);
});
server.requestTimeout = 15000;
server.headersTimeout = 18000;
server.keepAliveTimeout = 5000;

function startServer({ open = false, appMode = false } = {}) {
  if (server.listening) return Promise.resolve({ server, url: APP_URL, reused: false });
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      if (error.code === "EADDRINUSE") {
        const req = http.get(`${APP_URL}/api/health`, { timeout: 1200 }, (res) => {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => {
            try {
              const health = JSON.parse(Buffer.concat(chunks).toString("utf8"));
              if (health.app === "RigScope") {
                console.log(`RigScope is already running on ${APP_URL}`);
                if (open) openUrl(APP_URL, false);
                if (appMode) openUrl(APP_URL, true);
                resolve({ server: null, url: APP_URL, reused: true });
                return;
              }
            } catch {}
            reject(new Error(`Port ${PORT} is already in use by another process.`));
          });
        });
        req.on("timeout", () => req.destroy(new Error("health check timeout")));
        req.on("error", () => reject(new Error(`Port ${PORT} is already in use and does not look like RigScope.`)));
        return;
      }
      reject(error);
    };
    server.once("error", onError);
    server.listen(PORT, HOST, () => {
      server.off("error", onError);
      console.log(`RigScope running on ${APP_URL}`);
      if (open) openUrl(APP_URL, false);
      if (appMode) openUrl(APP_URL, true);
      resolve({ server, url: APP_URL, reused: false });
    });
  });
}

if (require.main === module) {
  startServer({
    open: process.argv.includes("--open"),
    appMode: process.argv.includes("--app")
  }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { startServer, server, setUpdateController };
