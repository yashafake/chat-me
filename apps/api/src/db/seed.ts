import { hashPassword } from "../security.js";
import { loadConfig } from "../config.js";
import { createPool, runSchema } from "./pool.js";

async function main() {
  const config = loadConfig();
  const pool = createPool(config);

  try {
    await runSchema(pool);

    const parseOrigins = (value: string | undefined, fallback: string[]) =>
      (value || fallback.join(","))
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);

    const defaultOrigins = parseOrigins(
      process.env.SEED_PROJECT_ORIGINS,
      ["http://localhost:3000", "http://localhost:3001"]
    );

    const projects = [
      {
        key: "etern8-main",
        displayName: "Etern8 Main",
        allowedOrigins: parseOrigins(process.env.SEED_ETERN8_MAIN_ORIGINS, defaultOrigins),
        widgetConfig: {
          locale: "ru",
          initialGreeting: "Здравствуйте. Подскажите, с чем помочь?",
          privacyUrl: "https://example.com/privacy",
          collectName: true,
          collectEmail: false,
          collectPhone: false
        },
        themeConfig: {
          accentColor: "#2dd4bf",
          position: "bottom-right",
          borderRadius: 20,
          buttonLabel: "Написать"
        }
      },
      {
        key: "etern8-store",
        displayName: "Etern8 Store",
        allowedOrigins: parseOrigins(process.env.SEED_ETERN8_STORE_ORIGINS, defaultOrigins),
        widgetConfig: {
          locale: "ru",
          initialGreeting: "Поможем с заказом, доставкой или подбором товара.",
          privacyUrl: "https://example.com/privacy",
          collectName: true,
          collectEmail: true,
          collectPhone: true
        },
        themeConfig: {
          accentColor: "#ff7a59",
          position: "bottom-right",
          borderRadius: 20,
          buttonLabel: "Есть вопрос?"
        }
      },
      {
        key: "insales-store",
        displayName: "InSales Store",
        allowedOrigins: parseOrigins(process.env.SEED_INSALES_STORE_ORIGINS, defaultOrigins),
        widgetConfig: {
          locale: "ru",
          initialGreeting: "Здравствуйте. Ответим по ассортименту и заказам.",
          privacyUrl: "https://example.com/privacy",
          collectName: true,
          collectEmail: false,
          collectPhone: true
        },
        themeConfig: {
          accentColor: "#d8b774",
          position: "bottom-left",
          borderRadius: 22,
          buttonLabel: "Связаться"
        }
      }
    ];

    for (const project of projects) {
      await pool.query(
        `
          INSERT INTO chat_projects (
            key,
            display_name,
            allowed_origins,
            status,
            theme_config,
            widget_config
          )
          VALUES ($1, $2, $3, 'active', $4::jsonb, $5::jsonb)
          ON CONFLICT (key)
          DO UPDATE SET
            display_name = EXCLUDED.display_name,
            allowed_origins = EXCLUDED.allowed_origins,
            theme_config = EXCLUDED.theme_config,
            widget_config = EXCLUDED.widget_config
        `,
        [
          project.key,
          project.displayName,
          project.allowedOrigins,
          JSON.stringify(project.themeConfig),
          JSON.stringify(project.widgetConfig)
        ]
      );
    }

    const operatorEmail =
      process.env.SEED_OPERATOR_LOGIN?.trim() ||
      process.env.SEED_OPERATOR_EMAIL?.trim() ||
      "operator@example.local";
    const operatorPassword = process.env.SEED_OPERATOR_PASSWORD?.trim() || "ChangeMe123!";
    const passwordHash = await hashPassword(operatorPassword, config.passwordPepper);

    await pool.query(
      `
        INSERT INTO chat_operators (
          email,
          password_hash,
          display_name,
          role,
          is_active
        )
        VALUES ($1, $2, $3, 'admin', TRUE)
        ON CONFLICT (email)
        DO UPDATE SET
          password_hash = EXCLUDED.password_hash,
          display_name = EXCLUDED.display_name,
          is_active = TRUE
      `,
      [operatorEmail.toLowerCase(), passwordHash, "Primary Operator"]
    );

    console.log("Seed complete.");
    console.log(`Operator login: ${operatorEmail}`);
    console.log(`Password: ${operatorPassword}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
