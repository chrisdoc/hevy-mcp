import { describe, expect, it, vi } from "vitest";
import { fetchAllPages } from "./pagination.js";

describe("fetchAllPages", () => {
	it("preserves page order and forwards the explicit page size", async () => {
		const loader = vi.fn(async (page: number, _pageSize: number) => ({
			items: [`page-${page}`],
			pageCount: 3,
		}));

		await expect(fetchAllPages(loader, 10)).resolves.toEqual([
			"page-1",
			"page-2",
			"page-3",
		]);
		expect(loader).toHaveBeenCalledTimes(3);
		expect(loader).toHaveBeenNthCalledWith(1, 1, 10);
	});

	it("stops when a page is empty even if the reported count keeps growing", async () => {
		const loader = vi.fn(async (page: number) => ({
			items: page === 1 ? ["first-page"] : [],
			pageCount: 1_000,
		}));

		await expect(fetchAllPages(loader, 10)).resolves.toEqual(["first-page"]);
		expect(loader).toHaveBeenCalledTimes(2);
	});

	it.each([
		[undefined, "missing"],
		[Number.NaN, "NaN"],
		[Number.POSITIVE_INFINITY, "Infinity"],
		[1.5, "fractional"],
		[0, "below current"],
	])(
		"stops after the current page for %s page counts",
		async (pageCount, _label) => {
			const loader = vi.fn().mockResolvedValue({
				items: ["only-page"],
				pageCount,
			});

			await expect(fetchAllPages(loader, 100)).resolves.toEqual(["only-page"]);
			expect(loader).toHaveBeenCalledOnce();
		},
	);
});
