/**
 * Resource classes and Accept-header content negotiation (#37).
 */
import { describe, expect, test } from "bun:test";
import { cors, createRouter, Resource, toResponse } from "../src/index.js";

interface User {
	id: number;
	name: string;
}

class UserResource extends Resource {
	constructor(private readonly user: User) {
		super();
	}

	override formats = {
		"application/ld+json": () => this.toJsonLd(),
	};

	toJSON() {
		return { id: this.user.id, name: this.user.name };
	}

	toJsonLd() {
		return {
			"@context": "https://schema.org",
			"@type": "Person",
			"@id": `/users/${this.user.id}`,
			name: this.user.name,
		};
	}
}

class JsonOnlyResource extends Resource {
	toJSON() {
		return { ok: true };
	}
}

const ada: User = { id: 1, name: "Ada" };

function app() {
	const router = createRouter();
	router.get("/users/1", () => new UserResource(ada));
	router.get("/plain", () => ({ id: 1 }));
	return router;
}

const get = (path: string, accept?: string) =>
	app().fetch(
		new Request(
			`http://localhost${path}`,
			accept === undefined ? {} : { headers: { Accept: accept } },
		),
	);

describe("Resource defaults", () => {
	test("a subclass without overrides has empty formats and no status or headers", () => {
		const resource = new JsonOnlyResource();
		expect(resource.formats).toEqual({});
		expect(resource.status).toBeUndefined();
		expect(resource.headers).toBeUndefined();
	});

	test("subclass field overrides win over the base defaults", () => {
		const resource = new UserResource(ada);
		expect(Object.keys(resource.formats)).toEqual(["application/ld+json"]);
	});
});

describe("Resource content negotiation", () => {
	test("missing Accept selects application/json via toJSON()", async () => {
		const res = await get("/users/1");
		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toBe("application/json");
		expect(await res.json()).toEqual({ id: 1, name: "Ada" });
	});

	test("Accept: application/json selects JSON", async () => {
		const res = await get("/users/1", "application/json");
		expect(res.headers.get("Content-Type")).toBe("application/json");
		expect(await res.json()).toEqual({ id: 1, name: "Ada" });
	});

	test("Accept: application/ld+json selects the registered JSON-LD converter", async () => {
		const res = await get("/users/1", "application/ld+json");
		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toBe("application/ld+json");
		expect(await res.json()).toEqual({
			"@context": "https://schema.org",
			"@type": "Person",
			"@id": "/users/1",
			name: "Ada",
		});
	});

	test("q-values outrank order", async () => {
		const res = await get("/users/1", "application/json;q=0.5, application/ld+json;q=0.9");
		expect(res.headers.get("Content-Type")).toBe("application/ld+json");
	});

	test("equal q-values fall back to the order in Accept", async () => {
		expect(
			(await get("/users/1", "application/ld+json, application/json")).headers.get("Content-Type"),
		).toBe("application/ld+json");
		expect(
			(await get("/users/1", "application/json, application/ld+json")).headers.get("Content-Type"),
		).toBe("application/json");
	});

	test("q=0 excludes a type", async () => {
		const res = await get("/users/1", "application/json;q=0, */*");
		expect(res.headers.get("Content-Type")).toBe("application/ld+json");
	});

	test("a more specific range overrides a wildcard's q-value", async () => {
		const res = await get("/users/1", "application/*;q=0.8, application/json;q=0.1");
		expect(res.headers.get("Content-Type")).toBe("application/ld+json");
	});

	test("*/* selects application/json", async () => {
		const res = await get("/users/1", "*/*");
		expect(res.headers.get("Content-Type")).toBe("application/json");
	});

	test("application/* selects application/json", async () => {
		const res = await get("/users/1", "application/*");
		expect(res.headers.get("Content-Type")).toBe("application/json");
	});

	test("type/* matches a registered type when json is not acceptable", async () => {
		const res = await get("/users/1", "application/*, application/json;q=0");
		expect(res.headers.get("Content-Type")).toBe("application/ld+json");
	});

	test("media type matching is case-insensitive and ignores other parameters", async () => {
		const res = await get("/users/1", 'Application/LD+JSON; profile="https://schema.org"');
		expect(res.headers.get("Content-Type")).toBe("application/ld+json");
	});

	test("unacceptable formats get a 406 problem listing the available types", async () => {
		const res = await get("/users/1", "text/csv");
		expect(res.status).toBe(406);
		expect(res.headers.get("Content-Type")).toBe("application/problem+json; charset=utf-8");
		expect(res.headers.get("Vary")).toBe("Accept");
		const body = (await res.json()) as { title: string; detail: string };
		expect(body.title).toBe("Not Acceptable");
		expect(body.detail).toContain("application/json");
		expect(body.detail).toContain("application/ld+json");
	});

	test("JSON-only resources reject application/ld+json with 406", async () => {
		const router = createRouter();
		router.get("/ok", () => new JsonOnlyResource());
		const res = await router.fetch(
			new Request("http://localhost/ok", { headers: { Accept: "application/ld+json" } }),
		);
		expect(res.status).toBe(406);
		const body = (await res.json()) as { detail: string };
		expect(body.detail).toContain("application/json");
		expect(body.detail).not.toContain("ld+json");
	});

	test("negotiated responses carry Vary: Accept", async () => {
		expect((await get("/users/1")).headers.get("Vary")).toBe("Accept");
		expect((await get("/users/1", "application/ld+json")).headers.get("Vary")).toBe("Accept");
	});

	test("Vary: Accept is appended to the resource's own Vary", async () => {
		class Tagged extends JsonOnlyResource {
			override headers = { Vary: "Accept-Encoding" };
		}
		const res = toResponse(new Tagged(), new Request("http://localhost/"));
		expect(res.headers.get("Vary")).toBe("Accept-Encoding, Accept");
	});

	test("global middleware that adds Vary keeps Vary: Accept", async () => {
		const router = createRouter();
		router.use(cors({ origin: "https://a.example" }));
		router.get("/users/1", () => new UserResource(ada));
		const res = await router.fetch(
			new Request("http://localhost/users/1", { headers: { Origin: "https://a.example" } }),
		);
		expect(res.headers.get("Vary")).toBe("Accept, Origin");
	});

	test("status and headers on the resource are applied", async () => {
		class Created extends JsonOnlyResource {
			override status = 201;
			override headers = { Location: "/ok/1" };
		}
		const res = toResponse(new Created(), new Request("http://localhost/"));
		expect(res.status).toBe(201);
		expect(res.headers.get("Location")).toBe("/ok/1");
		expect(res.headers.get("Content-Type")).toBe("application/json");
	});

	test("string converter results are sent as-is", async () => {
		class Csv extends JsonOnlyResource {
			override formats = { "text/csv": () => "ok\ntrue\n" };
		}
		const res = toResponse(
			new Csv(),
			new Request("http://localhost/", { headers: { Accept: "text/csv" } }),
		);
		expect(res.headers.get("Content-Type")).toBe("text/csv");
		expect(await res.text()).toBe("ok\ntrue\n");
	});

	test("a formats entry cannot replace toJSON() for application/json", async () => {
		class Sneaky extends JsonOnlyResource {
			override formats = { "application/json": () => ({ ok: false }) };
		}
		const res = toResponse(new Sneaky(), new Request("http://localhost/"));
		expect(await res.json()).toEqual({ ok: true });
	});

	test("toResponse without a request serves application/json", async () => {
		const res = toResponse(new UserResource(ada));
		expect(res.headers.get("Content-Type")).toBe("application/json");
		expect(res.headers.get("Vary")).toBe("Accept");
		expect(await res.json()).toEqual({ id: 1, name: "Ada" });
	});

	test("group middleware can negotiate with toResponse(await next(), ctx.request)", async () => {
		const router = createRouter();
		router.group(
			{
				prefix: "/api",
				middleware: [
					async (ctx, next) => {
						const res = toResponse(await next(), ctx.request);
						res.headers.set("X-Api", "1");
						return res;
					},
				],
			},
			(r) => {
				r.get("/users/1", () => new UserResource(ada));
			},
		);
		const res = await router.fetch(
			new Request("http://localhost/api/users/1", { headers: { Accept: "application/ld+json" } }),
		);
		expect(res.headers.get("Content-Type")).toBe("application/ld+json");
		expect(res.headers.get("X-Api")).toBe("1");
	});
});

describe("plain handlers are unchanged", () => {
	test("plain object handler ignores Accept and gets no Vary", async () => {
		const res = await get("/plain", "application/ld+json");
		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toBe("application/json");
		expect(res.headers.get("Vary")).toBeNull();
		expect(await res.json()).toEqual({ id: 1 });
	});

	test("string and Response handlers are unchanged", async () => {
		const router = createRouter();
		router.get("/text", () => "hi");
		router.get("/raw", () => new Response("raw", { status: 201 }));
		const text = await router.fetch(
			new Request("http://localhost/text", { headers: { Accept: "text/csv" } }),
		);
		expect(text.headers.get("Content-Type")).toBe("text/plain;charset=utf-8");
		expect(text.headers.get("Vary")).toBeNull();
		const raw = await router.fetch(
			new Request("http://localhost/raw", { headers: { Accept: "text/csv" } }),
		);
		expect(raw.status).toBe(201);
		expect(raw.headers.get("Vary")).toBeNull();
	});
});
