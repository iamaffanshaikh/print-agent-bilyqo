param([Parameter(Mandatory=$true)][string]$RequestPath)
$ErrorActionPreference = 'Stop'
try {
  $request = Get-Content -LiteralPath $RequestPath -Raw | ConvertFrom-Json
  if ($request.action -eq 'list') {
    $names = @(Get-CimInstance Win32_Printer | ForEach-Object { $_.Name })
    ConvertTo-Json -InputObject $names -Compress
    exit 0
  }
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class BilyqoRawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public class DocInfo { public string name="Bilyqo receipt"; public string output=null; public string type="RAW"; }
  [DllImport("winspool.drv",EntryPoint="OpenPrinterW",SetLastError=true,CharSet=CharSet.Unicode)] static extern bool OpenPrinter(string name,out IntPtr handle,IntPtr defaults);
  [DllImport("winspool.drv",SetLastError=true)] static extern bool ClosePrinter(IntPtr handle);
  [DllImport("winspool.drv",EntryPoint="StartDocPrinterW",SetLastError=true,CharSet=CharSet.Unicode)] static extern int StartDocPrinter(IntPtr handle,int level,[In] DocInfo info);
  [DllImport("winspool.drv",SetLastError=true)] static extern bool EndDocPrinter(IntPtr handle);
  [DllImport("winspool.drv",SetLastError=true)] static extern bool StartPagePrinter(IntPtr handle);
  [DllImport("winspool.drv",SetLastError=true)] static extern bool EndPagePrinter(IntPtr handle);
  [DllImport("winspool.drv",SetLastError=true)] static extern bool WritePrinter(IntPtr handle,byte[] data,int count,out int written);
  static void Check(bool success) { if(!success) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error()); }
  public static int Send(string printer,byte[] data) {
    IntPtr handle; Check(OpenPrinter(printer,out handle,IntPtr.Zero));
    bool started=false, page=false;
    try {
      int id=StartDocPrinter(handle,1,new DocInfo()); Check(id!=0); started=true;
      Check(StartPagePrinter(handle)); page=true;
      int written; Check(WritePrinter(handle,data,data.Length,out written));
      if(written!=data.Length) throw new Exception("Incomplete printer write. Check output before reprinting.");
      Check(EndPagePrinter(handle)); page=false;
      Check(EndDocPrinter(handle)); started=false;
      return id;
    } finally { if(page) EndPagePrinter(handle); if(started) EndDocPrinter(handle); ClosePrinter(handle); }
  }
}
'@
  if ($request.action -ne 'print') { throw 'Unknown action' }
  $bytes = [Convert]::FromBase64String($request.data)
  $job = [BilyqoRawPrinter]::Send([string]$request.printer,$bytes)
  @{ spoolId=$job } | ConvertTo-Json -Compress
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
