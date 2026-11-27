"""One-use local Windows pipe; no plaintext password file or command argument."""
import ctypes
from ctypes import wintypes
import os
import re
import secrets
import subprocess
import threading

class PasswordPipe:
    def __init__(self, password):
        if os.name!='nt':raise RuntimeError('Windows named pipe required')
        sid_output=subprocess.run(['whoami.exe','/user','/fo','csv','/nh'],capture_output=True,text=True,check=True).stdout
        sid=re.search(r'S-1-5-[\d-]+',sid_output)
        if not sid:raise RuntimeError('Current user SID unavailable')
        self.name=r'\\.\pipe\sentinela-bootstrap-'+secrets.token_hex(24)
        kernel=ctypes.WinDLL('kernel32',use_last_error=True);advapi=ctypes.WinDLL('advapi32',use_last_error=True)
        self.kernel=kernel
        kernel.CreateNamedPipeW.argtypes=[wintypes.LPCWSTR,wintypes.DWORD,wintypes.DWORD,wintypes.DWORD,wintypes.DWORD,wintypes.DWORD,wintypes.DWORD,ctypes.c_void_p]
        kernel.CreateNamedPipeW.restype=wintypes.HANDLE
        kernel.ConnectNamedPipe.argtypes=[wintypes.HANDLE,ctypes.c_void_p];kernel.ConnectNamedPipe.restype=wintypes.BOOL
        kernel.WriteFile.argtypes=[wintypes.HANDLE,ctypes.c_void_p,wintypes.DWORD,ctypes.POINTER(wintypes.DWORD),ctypes.c_void_p];kernel.WriteFile.restype=wintypes.BOOL
        kernel.CloseHandle.argtypes=[wintypes.HANDLE];kernel.CloseHandle.restype=wintypes.BOOL
        kernel.LocalFree.argtypes=[ctypes.c_void_p];kernel.LocalFree.restype=ctypes.c_void_p
        advapi.ConvertStringSecurityDescriptorToSecurityDescriptorW.argtypes=[wintypes.LPCWSTR,wintypes.DWORD,ctypes.POINTER(ctypes.c_void_p),ctypes.c_void_p]
        advapi.ConvertStringSecurityDescriptorToSecurityDescriptorW.restype=wintypes.BOOL
        class SecurityAttributes(ctypes.Structure):
            _fields_=[('length',wintypes.DWORD),('descriptor',ctypes.c_void_p),('inherit',wintypes.BOOL)]
        sd=ctypes.c_void_p()
        if not advapi.ConvertStringSecurityDescriptorToSecurityDescriptorW('D:P(A;;GA;;;'+sid.group(0)+')(A;;GA;;;SY)',1,ctypes.byref(sd),None):raise RuntimeError('Pipe DACL unavailable')
        attrs=SecurityAttributes(ctypes.sizeof(SecurityAttributes),sd,False)
        try:self.handle=kernel.CreateNamedPipeW(self.name,0x00080002,0x8,1,4096,4096,0,ctypes.byref(attrs))
        finally:kernel.LocalFree(sd)
        if self.handle==ctypes.c_void_p(-1).value:raise RuntimeError('Private pipe creation failed')
        self.error=None;self.delivered=False
        payload=(password+'\n').encode('utf8')
        def deliver():
            try:
                ok=kernel.ConnectNamedPipe(self.handle,None)
                if not ok and ctypes.get_last_error()!=535:raise RuntimeError('Private pipe connection failed')
                count=wintypes.DWORD()
                if not kernel.WriteFile(self.handle,payload,len(payload),ctypes.byref(count),None) or count.value!=len(payload):raise RuntimeError('Private pipe write failed')
                self.delivered=True
            except Exception as error:self.error=type(error).__name__
        self.thread=threading.Thread(target=deliver,daemon=True);self.thread.start()
    def close(self):
        self.kernel.CloseHandle(self.handle)
        self.thread.join(timeout=2)
