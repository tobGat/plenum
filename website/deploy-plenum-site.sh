#!/usr/bin/env bash
# Plenum-Infoseite ausliefern: https://plenum.schulapps.at (statische Seite, kein Node, kein pm2)
#
#   1) Seite nach /var/www/plenum (eine vorhandene Seite wird vorher gesichert)
#   2) nginx-Site plenum.schulapps.at (nur beim ersten Mal), nginx -t, reload
#   3) HTTPS per certbot (nur beim ersten Mal, wenn der DNS-Eintrag auf diesen Server zeigt)
#   4) Prüfung und Rückweg
#
# Erwartet unter /home/claude/plenum-site (legt `npm run stage:site` im Plenum-Projekt an):
#   site/                          fertige Seite (npm run build:site → dist-site/)
#   nginx/plenum.schulapps.at    nginx-Site
#   deploy-plenum-site.sh        dieses Skript
#
# Aufruf:  sudo bash /home/claude/plenum-site/deploy-plenum-site.sh
# Mehrfach ausführbar: Später erneuert ein Aufruf nur noch die Seite (Schritt 1).
# Fasst nichts anderes an: keine schulapps-Apps, keine fremden Sites, keine anderen Zertifikate.

set -euo pipefail

if [[ "$EUID" -ne 0 ]]; then
  echo "Bitte mit sudo starten."
  exit 1
fi

STAGE=/home/claude/plenum-site
WEB=/var/www/plenum
SITE=plenum.schulapps.at
AVAIL=/etc/nginx/sites-available/$SITE
ENABLED=/etc/nginx/sites-enabled/$SITE
SERVER_IP=46.225.168.25
TS=$(date +%Y%m%d-%H%M%S)
BACKUP=/var/backups/plenum-site/$TS

test -f "$STAGE/site/index.html" || { echo "FEHLT: $STAGE/site/index.html"; exit 1; }
test -f "$STAGE/nginx/$SITE" || { echo "FEHLT: $STAGE/nginx/$SITE"; exit 1; }

install -d -m 700 /var/backups/plenum-site
install -d -m 700 "$BACKUP"

echo "=== 1) Seite ($WEB) ==="
if [[ -d "$WEB" ]]; then
  cp -a "$WEB" "$BACKUP/www"
  echo "    Sicherung: $BACKUP/www"
fi
mkdir -p "$WEB"
rsync -a --delete "$STAGE/site/" "$WEB/"
chown -R root:root "$WEB"
find "$WEB" -type d -exec chmod 755 {} +
find "$WEB" -type f -exec chmod 644 {} +
echo "    $(find "$WEB" -type f | wc -l) Dateien"

echo "=== 2) nginx ($SITE) ==="
NEW_SITE=0
if [[ -f "$AVAIL" ]]; then
  echo "    Site existiert schon (von certbot ergänzt) – bleibt unverändert"
else
  install -o root -g root -m 644 "$STAGE/nginx/$SITE" "$AVAIL"
  ln -s "$AVAIL" "$ENABLED"
  NEW_SITE=1
  echo "    Site angelegt"
fi
if ! nginx -t; then
  if [[ "$NEW_SITE" -eq 1 ]]; then
    rm -f "$ENABLED" "$AVAIL"
    echo "FEHLER: nginx -t schlug fehl – die neue Site ist wieder entfernt, nginx läuft unverändert weiter."
  else
    echo "FEHLER: nginx -t schlug fehl – nginx wurde nicht neu geladen. Bitte $AVAIL prüfen."
  fi
  exit 1
fi
systemctl reload nginx

echo "=== 3) HTTPS ==="
DNS_IP=$(getent ahostsv4 "$SITE" | awk 'NR==1 {print $1}' || true)
if [[ -d "/etc/letsencrypt/live/$SITE" ]]; then
  echo "    Zertifikat vorhanden"
elif [[ "$DNS_IP" == "$SERVER_IP" ]]; then
  cp -a "$AVAIL" "$BACKUP/$SITE.vor-certbot"
  certbot --nginx -d "$SITE" --non-interactive --agree-tos --redirect
  nginx -t && systemctl reload nginx
else
  echo "    ACHTUNG: $SITE zeigt nicht auf $SERVER_IP (DNS: ${DNS_IP:-kein Eintrag}) – HTTPS übersprungen."
  echo "    Nach dem DNS-Eintrag dieses Skript noch einmal ausführen."
fi

echo
echo "=== Prüfung ==="
sleep 1
status() { curl -s -o /dev/null -w "HTTP %{http_code}" "$@" || echo "(keine Antwort)"; }
echo "nginx lokal (Host-Header)       → $(status -H "Host: $SITE" http://127.0.0.1/)"
if [[ -d "/etc/letsencrypt/live/$SITE" ]]; then
  for p in / /datenschutz.html /datenschutz /impressum.html /gibt-es-nicht; do
    printf '%-32s → %s\n' "https://$SITE$p" "$(status "https://$SITE$p")"
  done
  HEADERS=$(curl -sI "https://$SITE/" | grep -ciE '^(strict-transport-security|content-security-policy|x-frame-options):' || true)
  echo "Security-Header                 → $HEADERS von 3"
fi
echo "https://schulapps.at/           → $(status https://schulapps.at/)"

echo
echo "Rückweg:"
if [[ -d "$BACKUP/www" ]]; then
  echo "  Vorige Seite zurück:  sudo rsync -a --delete $BACKUP/www/ $WEB/"
fi
echo "  Alles entfernen:      sudo rm $ENABLED && sudo systemctl reload nginx"
echo "                        sudo rm -r $AVAIL $WEB"
echo "                        sudo certbot delete --cert-name $SITE"
