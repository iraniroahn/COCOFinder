import Foundation
import CoreLocation

struct PetrolPump: Identifiable, Codable {
    let id: UUID
    let name: String
    let address: String
    let latitude: Double
    let longitude: Double
    let isCOCO: Bool
    let facilities: [String]
    
    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }
    
    init(id: UUID = UUID(), name: String, address: String, latitude: Double, longitude: Double, isCOCO: Bool = true, facilities: [String] = ["Petrol", "Diesel", "Air", "Nitrogen"]) {
        self.id = id
        self.name = name
        self.address = address
        self.latitude = latitude
        self.longitude = longitude
        self.isCOCO = isCOCO
        self.facilities = facilities
    }
}
