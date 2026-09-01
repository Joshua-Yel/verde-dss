import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "./src/lib/middleware";

// export async function middleware(request: NextRequest) {
//   return await updateSession(request);
// }


export async function middleware(request: NextRequest) {
  // Temporary maintenance mode
  return new NextResponse(
    `
      <!DOCTYPE html>
      <html>
        <head>
          <title>System Temporarily Unavailable</title>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <style>
            * {
              box-sizing: border-box;
            }

            body {
              margin: 0;
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              font-family: Arial, sans-serif;
              background: #f8fafc;
              color: #111827;
              text-align: center;
            }

            .container {
              padding: 24px;
              max-width: 600px;
            }

            h1 {
              font-size: 32px;
              font-weight: 600;
              margin: 0 0 12px;
            }

            p {
              font-size: 16px;
              line-height: 1.6;
              color: #6b7280;
              margin: 0;
            }
          </style>
        </head>

        <body>
          <div class="container">
            <h1>System temporarily unavailable</h1>
            <p>
              We're currently applying updates. Please check back shortly.
            </p>
          </div>
        </body>
      </html>
    `,
    {
      status: 503,
      headers: {
        "Content-Type": "text/html",
      },
    }
  );

  // Existing authentication/session logic
  // return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
