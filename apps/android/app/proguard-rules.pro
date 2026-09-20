# R8 shrinks and obfuscates the release build. There is nothing to keep: no reflection, no serialization
# library, no JNI, no Parcelable created by name, no class looked up by string anywhere in this app.
#
# The only things worth stating are the ones a mistake would hide.

# Never keep source file names or line numbers in a release: a stack trace is never collected, because there is
# no crash reporting, so this is only weight and only information about the person's phone.
-renamesourcefileattribute ""
-keepattributes !SourceFile,!LineNumberTable

# The activity is named in AndroidManifest.xml, so AGP's generated rules already keep it. Nothing else is.

# Fail loudly rather than silently shipping something half-shrunk.
-ignorewarnings
