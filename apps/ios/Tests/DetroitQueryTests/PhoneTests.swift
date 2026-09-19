// Same cases as apps/web/test/web.test.ts "phone links".
import XCTest
@testable import DetroitQuery

final class PhoneTests: XCTestCase {
    func testExtensionsDialAfterAPause() {
        XCTAssertEqual(telLink("313-579-2100 ext. 4217"), "tel:+13135792100,4217")
        XCTAssertEqual(telLink("313-579-2100 x12"), "tel:+13135792100,12")
        XCTAssertEqual(telLink("(313) 579-2100 Extension 3"), "tel:+13135792100,3")
    }
    func testPlainShortAndTollFree() {
        XCTAssertEqual(telLink("313-579-2100"), "tel:+13135792100")
        XCTAssertEqual(telLink("1-866-313-2520"), "tel:+18663132520")
        XCTAssertEqual(telLink("911"), "tel:911")
        XCTAssertEqual(telLink("988"), "tel:988")
        XCTAssertEqual(telLink("211"), "tel:211")
    }
}
