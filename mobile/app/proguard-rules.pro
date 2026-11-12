# kotlinx.serialization keeps its generated serializers.
-keepattributes *Annotation*, InnerClasses
-keep,includedescriptorclasses class kz.keyfive.staff.**$$serializer { *; }
-keepclassmembers class kz.keyfive.staff.** { *** Companion; }
-keepclasseswithmembers class kz.keyfive.staff.** { kotlinx.serialization.KSerializer serializer(...); }
