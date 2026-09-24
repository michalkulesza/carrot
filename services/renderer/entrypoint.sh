#!/bin/sh
set -eu
# Prevent Chromium DNS rebinding from reaching private, loopback, or reserved IPs.
iptables -A OUTPUT -d 127.0.0.11/32 -p udp --dport 53 -j ACCEPT
iptables -A OUTPUT -d 127.0.0.11/32 -p tcp --dport 53 -j ACCEPT
while read -r kind resolver _; do
  [ "$kind" = nameserver ] || continue
  case "$resolver" in
    *:*) ip6tables -A OUTPUT -d "$resolver" -p udp --dport 53 -j ACCEPT; ip6tables -A OUTPUT -d "$resolver" -p tcp --dport 53 -j ACCEPT ;;
    *) iptables -A OUTPUT -d "$resolver/32" -p udp --dport 53 -j ACCEPT; iptables -A OUTPUT -d "$resolver/32" -p tcp --dport 53 -j ACCEPT ;;
  esac
done < /etc/resolv.conf
iptables -A OUTPUT -d 127.0.0.1/32 -p tcp --dport 8080 -j ACCEPT
iptables -A OUTPUT -d 127.0.0.1/32 -p tcp --dport 18081 -j ACCEPT
iptables -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
for range in 0.0.0.0/8 10.0.0.0/8 100.64.0.0/10 127.0.0.0/8 169.254.0.0/16 172.16.0.0/12 192.0.0.0/24 192.0.2.0/24 192.31.196.0/24 192.52.193.0/24 192.88.99.0/24 192.168.0.0/16 192.175.48.0/24 198.18.0.0/15 198.51.100.0/24 203.0.113.0/24 224.0.0.0/4 240.0.0.0/4; do
  iptables -A OUTPUT -d "$range" -j REJECT
done
for range in ::/128 ::1/128 ::ffff:0:0/96 64:ff9b::/96 64:ff9b:1::/48 100::/64 2001::/23 2001:db8::/32 2002::/16 fc00::/7 fe80::/10 ff00::/8; do
  ip6tables -A OUTPUT -d "$range" -j REJECT
done
exec su -s /bin/sh pwuser -c 'node /app/server.mjs'
