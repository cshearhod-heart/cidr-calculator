# CIDR Calculator

An offline IPv4 / IPv6 subnet calculator with three tabs: IPv4, IPv6, and subnet splitting. Tap any result row to copy it.

**Live: https://cshearhod-heart.github.io/cidr-calculator/**

## Works offline, sends nothing

Everything is calculated in the page. There is no analytics, no remote font, and no request to any server. The page's Content Security Policy sets `connect-src 'none'`, so it cannot make a network request even if code tried to.

The first visit caches the app with a service worker, which fetches only the files in this repository. After that it opens and works with no network at all.

## Install it on a phone

- **iPhone or iPad:** open the link in Safari, tap Share, then **Add to Home Screen**.
- **Android:** open the link in Chrome and accept the install prompt, or use the menu's **Add to Home screen**.

It then opens full screen like an app, and keeps working offline.

## What it shows

- **IPv4:** network, broadcast, netmask, wildcard, host range, usable and total addresses, binary mask, and address type. /31 point-to-point links follow RFC 3021.
- **IPv6:** compressed and expanded forms, first and last address, prefix, total addresses, and address type.
- **Split:** divides a network into equal subnets.

On wide screens (tablets, landscape phones, foldables unfolded) the input and the results sit side by side.

## About this repository

This repository holds the published web build only. It is generated from a separate source repository, where the calculations are covered by tests. Files here are replaced on each release, so changes made directly in this repository will be overwritten.
