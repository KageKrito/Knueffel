# Kniffel mit Freunden

Ein einfacher Echtzeit-Kniffelraum mit einem gemeinsamen Raum, ohne Lobby-System. Der Server verwaltet Würfe und Punkte, alle Browser sehen denselben Spielstand.

## Voraussetzungen
- Node.js 18 oder neuer
- Internetzugriff zum Installieren der Pakete

## Lokal starten
1. ZIP entpacken.
2. Im Projektordner ein Terminal öffnen.
3. `npm install`
4. `npm start`
5. Im Browser `http://localhost:3000` öffnen.

## Mit Freunden spielen
Damit Freunde von anderen Geräten/Orten mitspielen können, muss der Node-Server auf einem öffentlich erreichbaren Host laufen (z. B. einem Node-fähigen Hosting-Anbieter). Dann teilst du die öffentliche URL. `localhost` funktioniert nur auf deinem eigenen Rechner.

## Enthalten
- Ein gemeinsamer Raum, bis zu 8 Spieler
- Echtzeit-Updates über Socket.IO
- Bis zu drei Würfe pro Zug, Würfel behalten
- Alle 13 Kniffel-Kategorien
- 35 Bonuspunkte ab 63 Punkten im oberen Block
- Serverseitige Prüfung von Würfen und Einträgen

## Hinweise
- Dies ist ein einfacher Prototyp ohne Datenbank. Der Spielstand lebt nur im Arbeitsspeicher des Servers und geht beim Neustart verloren.
- Spieler sollten vor dem Start beitreten. Ein Spielstand lässt sich aktuell nicht nach einem Browser-Neuladen wieder aufnehmen.
- Die Punktewertung nutzt die üblichen Kniffel-Grundregeln. Sonderregeln für zusätzliche Kniffel sind nicht implementiert.
