# Switching between Windows and Linux ingestion

Both setups write to the same Supabase catalog and rotation tables. Switch the scheduled writer and monitoring mode together. Keep only one scheduled ingestion setup writing to the deployed database at a time.

## Workflow differences

| Area | Windows | Linux |
|---|---|---|
| Client access | Hasagi reads a running League client. | Direct collection uses a signed-in Riot Client under Wine. A separate League client collector is also available. |
| Source files | Separate JSON files for each shop. | One validated `clientSnapshot.json`. |
| Processing | `processStaticData.ts` and `processClientData.ts` | `processStaticDataLinux.ts` and `processClientDataLinux.ts` |
| Scheduling | Client startup wrapper and wake scheduling. | Docker runtime and hourly systemd timer. |
| Configuration | `.env.prod` for production processors. | `.env.linux.prod` and `.env.proxy.local`. |
| Monitoring | Processing heartbeat and optional wake scheduler. | Processing heartbeat, runner status, and email status. |

## Switch to Linux

1. Validate Linux collection against the in-game store using a local database.
2. Prepare a separate deployment checkout and the runtime described in the [Linux deployment guide](linux-production.md).
3. Apply the required database migrations and configure the email worker, API refresh destination, and Linux monitor.
4. Stop Windows ingestion jobs and any pending wake or startup jobs. Wait for an active run to finish.
5. Run one Linux ingestion through its systemd service. Confirm the database, heartbeat, API cache, and email result.
6. Enable the Linux timer and check that the next scheduled run completes.

The public web app continues reading the shared tables. Use the Linux monitoring entry point to detect collection and email failures independently.

## Switch back to Windows

Stop the Linux timer and any active ingestion service before restoring Windows scheduling. Stop its managed email job as well if delivery is still active. Switch monitoring to the Windows configuration, confirm a successful run, and preserve database and API cache data during the transition.

See [Windows ingestion](windows-ingestion.md) for its commands and [Linux deployment](linux-production.md) for service operations.
