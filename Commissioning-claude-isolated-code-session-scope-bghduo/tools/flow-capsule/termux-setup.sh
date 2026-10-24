#!/data/data/com.termux/files/usr/bin/bash
set -Eeuo pipefail
V=2.0.0-termux.1; P=${PREFIX:-}; H=${HOME:-}; A="$H/.local/share/flowcapsule"; D="$H/.local/state/flowcapsule"; C="$H/.config/flowcapsule"; B="$H/.local/share/flowcapsule-backups"; S=$(CDPATH= cd -- "$(dirname "$0")" && pwd); X=${1:-help}
mkdir -p "$D/logs"; chmod 700 "$D" "$D/logs"; L="$D/logs/setup-$(date -u +%Y%m%dT%H%M%SZ).log"; touch "$L"; chmod 600 "$L"
redact(){ sed -E 's#https://[^ ]+#https://[REDACTED]#g;s/(Bearer )[A-Za-z0-9._~-]+/\1[REDACTED]/g'; }; log(){ printf '[%s] %s\n' "$(date -u +%FT%TZ)" "$*"|redact|tee -a "$L"; }; fail(){ log "ERROR: $*"; exit 1; }; run(){ log "$1"; shift; "$@" >>"$L" 2>&1||fail "$1 failed; see $L"; }
preflight(){
 [ "$P" = /data/data/com.termux/files/usr ]||fail 'Run inside an unmodified Termux environment.'; command -v getprop >/dev/null||fail 'getprop missing.'; command -v pkg >/dev/null||fail 'pkg missing.'
 sdk=$(getprop ro.build.version.sdk); [ "${sdk:-0}" -ge 24 ]||fail "Android API $sdk unsupported; API 24+ required."; arch=$(uname -m); case $arch in aarch64|armv7l|x86_64|i686);;*) fail "Unsupported architecture $arch";;esac
 free=$(df -Pk "$H"|awk 'NR==2{print $4}'); [ "$free" -ge 204800 ]||fail 'At least 200 MiB free storage required.'; log "preflight architecture=$arch api=$sdk freeKiB=$free"
 if command -v termux-info >/dev/null; then info=$(termux-info 2>/dev/null||true); printf '%s\n' "$info"|redact >>"$L"; rel=$(printf '%s\n' "$info"|sed -n 's/^TERMUX_APK_RELEASE=//p'|head -1); case $rel in F_DROID|GITHUB) log "supported release=$rel";;*) log "WARNING: release source '$rel' is unverified. All Termux add-ons must come from the same source.";;esac; fi
 command -v curl >/dev/null&&curl -fsSI --connect-timeout 8 --max-time 15 https://packages.termux.dev >/dev/null 2>&1||log 'WARNING: repository network probe failed; package installation may fail.'
}
packages(){ run 'Refreshing repositories' pkg update -y; run 'Upgrading packages' pkg upgrade -y; run 'Installing dependencies' pkg install -y python termux-tools curl tar coreutils procps termux-services; python -c 'import sys;assert sys.version_info>=(3,11)'||fail 'Python 3.11+ required.'; }
storage(){ if [ ! -e "$H/storage/shared" ]; then log 'Android storage permission prompt may appear.'; termux-setup-storage >>"$L" 2>&1||fail 'Storage permission failed; grant Files permission and rerun repair.'; sleep 2; fi; }
config(){ mkdir -p "$C" "$A/releases" "$B" "$H/.local/bin"; chmod 700 "$C" "$A" "$A/releases" "$B" "$H/.local/bin"; cat >"$C/environment.tmp" <<EOF
FLOWCAP_DATA_DIR=$D
FLOWCAP_HOST=127.0.0.1
FLOWCAP_PORT=8787
FLOWCAP_MAX_BODY_BYTES=1048576
FLOWCAP_VERIFY_TIMEOUT_SECONDS=20
FLOWCAP_INVOKE_TIMEOUT_SECONDS=60
FLOWCAP_RATE_LIMIT_PER_MINUTE=120
FLOWCAP_VERSION_RETENTION=5
FLOWCAP_ALLOWED_HOST_SUFFIXES=.api.powerplatform.com,.logic.azure.com
EOF
 chmod 600 "$C/environment.tmp"; mv -f "$C/environment.tmp" "$C/environment"; grep -Fq '# flowcapsule-termux' "$H/.profile" 2>/dev/null||printf '\n# flowcapsule-termux\n[ -f "%s/environment" ] && set -a && . "%s/environment" && set +a\nexport PATH="%s/.local/bin:$PATH"\n' "$C" "$C" "$H" >>"$H/.profile"; chmod 600 "$H/.profile"; }
release(){ dst="$A/releases/$V"; tmp="$A/releases/.stage-$$"; rm -rf "$tmp"; mkdir "$tmp"; cp "$S/app/"* "$tmp/"; chmod 700 "$tmp/flowcapsule.py" "$tmp/flowcapctl.py"; chmod 600 "$tmp/POWER_AUTOMATE.md"; python -m py_compile "$tmp/"*.py||fail 'Compile validation failed.'; [ -d "$dst" ]||mv "$tmp" "$dst"; rm -rf "$tmp"; ln -sfn "$dst" "$A/.next"; mv -Tf "$A/.next" "$A/current"; ln -sfn "$A/current/flowcapctl.py" "$H/.local/bin/flowcapctl"; }
service(){ mkdir -p "$H/.termux/service/flowcapsule"; chmod 700 "$H/.termux/service/flowcapsule"; cat >"$H/.termux/service/flowcapsule/run" <<EOF
#!/data/data/com.termux/files/usr/bin/sh
set -a;. "$C/environment";set +a
exec python "$A/current/flowcapsule.py" 2>&1
EOF
 chmod 700 "$H/.termux/service/flowcapsule/run"; if command -v sv-enable >/dev/null; then sv-enable flowcapsule >>"$L" 2>&1||true; sv up flowcapsule >>"$L" 2>&1||true; else nohup sh "$H/.termux/service/flowcapsule/run" >>"$D/service.log" 2>&1 & echo $! >"$D/service.pid"; log 'WARNING: restart Termux once, then run repair to activate termux-services.'; fi; }
verify(){ [ -L "$A/current" ]||fail 'Active release missing.'; [ -f "$C/environment" ]||fail 'Configuration missing.'; . "$C/environment"; n=0; until python "$A/current/flowcapctl.py" --base-url "http://$FLOWCAP_HOST:$FLOWCAP_PORT" health >>"$L" 2>&1; do n=$((n+1)); [ $n -lt 20 ]||fail 'Health endpoint unavailable.'; sleep 1; done; [ -f "$D/bootstrap-credentials.json" ]||fail 'Credentials missing.'; [ "$(stat -c %a "$D/bootstrap-credentials.json")" = 600 ]||fail 'Credential permissions are not 600.'; python -m unittest discover -s "$S/tests" -v >>"$L" 2>&1||fail 'Tests failed.'; log 'POST-INSTALL CHECKS PASSED.'; }
backup(){ preflight; [ -f "$D/registry.db" ]||fail 'Database missing.'; mkdir -p "$B"; out="$B/flowcapsule-$(date -u +%Y%m%dT%H%M%SZ).tar.gz"; python "$A/current/flowcapctl.py" backup --data-dir "$D" --output "$out" >>"$L" 2>&1; tar -tzf "$out" >/dev/null||fail 'Backup corrupt.'; chmod 600 "$out"; log "backup=$out"; }
rollback(){ preflight; old=$(find "$A/releases" -mindepth 1 -maxdepth 1 -type d ! -name "$V"|sort|tail -1); [ -n "$old" ]||fail 'No retained release.'; printf 'Switch code to %s without deleting data? Type ROLLBACK: ' "$old"; read -r y; [ "$y" = ROLLBACK ]||fail 'Cancelled.'; ln -sfn "$old" "$A/.next"; mv -Tf "$A/.next" "$A/current"; command -v sv >/dev/null&&sv restart flowcapsule >>"$L" 2>&1||true; verify; }
diagnose(){ preflight; python --version >>"$L" 2>&1||true; pkg --version >>"$L" 2>&1||true; df -h "$H" >>"$L"; command -v sv >/dev/null&&sv status flowcapsule >>"$L" 2>&1||true; log "diagnostics=$L"; }
uninstall(){ preflight; printf 'Remove code/service but preserve data and backups? Type UNINSTALL: '; read -r y; [ "$y" = UNINSTALL ]||fail 'Cancelled.'; command -v sv >/dev/null&&sv down flowcapsule >>"$L" 2>&1||true; rm -rf "$H/.termux/service/flowcapsule" "$A" "$H/.local/bin/flowcapctl"; log "uninstalled; preserved=$D"; }
all(){ preflight; packages; storage; config; release; service; verify; log "COMPLETE version=$V log=$L"; }
case $X in install|update) all;;verify) preflight;verify;;diagnose) diagnose;;repair) all;;backup) backup;;rollback) rollback;;uninstall) uninstall;;help) echo './termux-setup.sh {install|update|verify|diagnose|repair|backup|rollback|uninstall|help}';;*) fail "Unknown operation $X";;esac
