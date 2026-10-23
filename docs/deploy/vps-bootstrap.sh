#!/usr/bin/env bash
# Prépare un VPS Ubuntu 24.04 neuf pour Crossverse. À lancer UNE fois, en root :
#   curl -fsSL https://raw.githubusercontent.com/madoxSio/croise-tress/main/docs/deploy/vps-bootstrap.sh -o bootstrap.sh
#   less bootstrap.sh            # le relire avant de l'exécuter
#   sudo bash bootstrap.sh crossverse.duckdns.org "ssh-ed25519 AAAA… crossverse-deploy"
# Résultat : Docker, pare-feu (22, 80, 443), mises à jour de sécurité automatiques, utilisateur
# `deploy` (clé SSH de la CI), dépôt dans /opt/crossverse, .env.prod à compléter (SMTP),
# sauvegarde quotidienne de la base (14 jours conservés).
set -euo pipefail

DOMAIN="${1:?usage : bootstrap.sh <domaine> <clé publique SSH de déploiement>}"
DEPLOY_KEY="${2:?usage : bootstrap.sh <domaine> <clé publique SSH de déploiement>}"
REPO=https://github.com/madoxSio/croise-tress.git
APP=/opt/crossverse

[ "$(id -u)" -eq 0 ] || { echo "À lancer en root."; exit 1; }

apt-get update -q
apt-get install -y -q ca-certificates curl git make ufw unattended-upgrades
dpkg-reconfigure -f noninteractive unattended-upgrades

# Docker Engine et le plugin Compose depuis le dépôt officiel de Docker.
if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  # shellcheck source=/dev/null
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi

# Pare-feu : SSH et HTTP(S) seulement (443/udp pour HTTP/3). Docker publie 80/443 lui-même.
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

# Utilisateur de déploiement : clé SSH seule. Le groupe docker équivaut à un accès root : la
# clé privée ne vit que dans le secret GitHub VPS_SSH_KEY.
id deploy >/dev/null 2>&1 || adduser --disabled-password --gecos '' deploy
usermod -aG docker deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
printf '%s\n' "$DEPLOY_KEY" > /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys

# Connexion SSH par clé uniquement (vérifier d'abord que votre propre clé fonctionne !).
cat > /etc/ssh/sshd_config.d/10-crossverse.conf <<'CONF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
CONF
systemctl reload ssh

# Dépôt et configuration de production.
[ -d "$APP/.git" ] || git clone --quiet --depth 1 "$REPO" "$APP"
chown -R deploy:deploy "$APP"
if [ ! -f "$APP/.env.prod" ]; then
  password="$(openssl rand -base64 33 | tr -d '/+=')"
  sed -e "s/^DOMAIN=.*/DOMAIN=${DOMAIN}/" \
      -e "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=${password}/" \
      -e "s/crossverse.example.com/${DOMAIN}/" \
      "$APP/.env.prod.example" > "$APP/.env.prod"
  chown deploy:deploy "$APP/.env.prod"
  chmod 600 "$APP/.env.prod"
fi

# Sauvegarde quotidienne à 3 h (UTC), 14 jours conservés.
cat > /etc/cron.d/crossverse-backup <<CRON
0 3 * * * deploy cd $APP && make prod-backup >/dev/null 2>&1 && find $APP/backups -name 'prod-*.dump' -mtime +14 -delete
CRON

echo
echo "Prêt. Reste à faire :"
echo "  1. Compléter SMTP_* et MAIL_FROM dans $APP/.env.prod (nano $APP/.env.prod)."
echo "  2. Premier démarrage : su - deploy -c 'cd $APP && make prod-pull && make prod-seed'"
echo "  3. Clé d'hôte à transmettre (secret GitHub VPS_KNOWN_HOSTS = « <IP> <cette ligne> ») :"
cut -d' ' -f1,2 /etc/ssh/ssh_host_ed25519_key.pub
